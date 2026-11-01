/** Resolves current server-owned scope before any secret access or provider operation. */
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_AUTHORIZATION_PURPOSE, MESSAGING_CREDENTIAL_USABLE_STATES } from "@/src/modules/messaging/constants/messaging-connection";
import { messagingFailure, type MessagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";
import type { AuthorizedMessagingContext, MessagingAccountProvider, MessagingAuthorizationReader, MessagingLeadershipFacts, MessagingOriginalOperationLookup, MessagingSecretStore, MessagingSecurityFacts, MessagingSecurityFactsProvider } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MessagingPlatformSecurityError } from "@/src/modules/messaging/domain/errors/messaging-platform-security-error";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { PLATFORM_SECURITY_REQUIREMENT } from "@/src/modules/shared/constants/platform-security";

/** Boundary-validated resource identity and fixed server operation; a write also names its original caller UUID. */
export type ResolveMessagingContextCommand = { tribeId: string; connectionId: string; operation: string; requestId: string; operationId?: string };

/** Checks the authoritative tribe leader and current active membership, not a cached role. */
function hasCurrentLeadership(leadership: MessagingLeadershipFacts | null, tribeId: string, userId: string): leadership is MessagingLeadershipFacts {
  return leadership?.tribeId === tribeId && leadership.leaderUserId === userId
    && leadership.membership?.userId === userId && leadership.membership.role === TRIBE_MEMBER_ROLE.leader
    && leadership.membership.status === TRIBE_MEMBERSHIP_STATUS.active;
}

/** Resolves a sensitive leader context; SecretStore independently revalidates before use. */
export class ResolveMessagingContextUseCase {
  /**
   * Injects own current-state readers without caching account, role, connection or keys.
   * @param accounts - Current global account projection adapted from auth.
   * @param authorization - Membership/leadership and tenant-scoped resource reader.
   * @param security - External epoch/recovery facts, not database tombstones alone.
   * @param clock - Current time evaluated after awaited reads, including lock waits.
   */
  constructor(
    private readonly accounts: MessagingAccountProvider,
    private readonly authorization: MessagingAuthorizationReader,
    private readonly security: MessagingSecurityFactsProvider,
    private readonly clock: () => Date,
  ) {}

  /**
   * Produces a private authorized context; it never returns the credential itself.
   *
   * Resource, tribe, user, account and live session are all checked from current
   * own readers; no recent account confirmation is required. Failed authority
   * precedes reading a connection secret.
   * The SQL writer and SecretStore must repeat authority under their locks.
   *
   * @param command - Boundary-validated resource identity and fixed server operation.
   * @returns Private context or a safe expected failure, without cross-tenant details.
   */
  async execute(command: ResolveMessagingContextCommand): Promise<{ context: AuthorizedMessagingContext; allowed: true } | { allowed: false; failure: MessagingFailure }> {
    const deny = (code: MessagingFailure["code"]) => ({ allowed: false as const, failure: messagingFailure(code) });
    const initialAccount = await this.accounts.getAuthenticatedAccount();
    if (!initialAccount || !isAuthenticatedSessionLive(initialAccount.session.expiresAt, this.clock())) return deny(MESSAGING_ERROR_CODE.authenticationRequired);
    const initialLeadership = await this.authorization.getCurrentLeadership(command.tribeId, initialAccount.userId);
    if (!hasCurrentLeadership(initialLeadership, command.tribeId, initialAccount.userId)) return deny(MESSAGING_ERROR_CODE.permissionDenied);
    const connection = await this.authorization.getConnection(command.tribeId, command.connectionId);
    if (connection?.tribeId !== command.tribeId || connection.id !== command.connectionId || connection.contributedByUserId !== initialAccount.userId || connection.retiredAt !== null || !connection.secretRef || !Number.isInteger(connection.version) || connection.version < 1) return deny(MESSAGING_ERROR_CODE.resourceUnavailable);
    if (!MESSAGING_CREDENTIAL_USABLE_STATES.has(connection.state)) return deny(MESSAGING_ERROR_CODE.connectionIncomplete);
    let security: MessagingSecurityFacts;
    try { security = await this.security.getCurrentSecurityFacts(); }
    catch (error) {
      if (error instanceof MessagingPlatformSecurityError) return { allowed: false as const, failure: messagingFailure(error.code, { cause: error }) };
      throw error;
    }
    // A locked or unidentified platform blocks every connection alike; only the TuTribu team can resolve it.
    if (security.recoveryLocked || !security.environment || !security.securityEpoch) return { allowed: false as const, failure: messagingFailure(MESSAGING_ERROR_CODE.platformSecurityUnavailable, { cause: new MessagingPlatformSecurityError(security.recoveryLocked ? PLATFORM_SECURITY_REQUIREMENT.recoveryLocked : PLATFORM_SECURITY_REQUIREMENT.unconfigured) }) };
    // A connection sealed under another environment or epoch needs a new key from its leader.
    if (connection.environment !== security.environment || connection.securityEpoch !== security.securityEpoch) return deny(MESSAGING_ERROR_CODE.connectionIncomplete);
    // Resource/security reads may wait. Resolve current session/leadership again;
    // the concrete writer/SecretStore repeats these facts under its own locks.
    const account = await this.accounts.getAuthenticatedAccount();
    if (account?.userId !== initialAccount.userId || account.session.id !== initialAccount.session.id) return deny(MESSAGING_ERROR_CODE.authenticationRequired);
    const leadership = await this.authorization.getCurrentLeadership(command.tribeId, account.userId);
    if (!hasCurrentLeadership(leadership, command.tribeId, account.userId)) return deny(MESSAGING_ERROR_CODE.permissionDenied);
    const now = this.clock();
    if (!isAuthenticatedSessionLive(account.session.expiresAt, now)) return deny(MESSAGING_ERROR_CODE.authenticationRequired);
    // The Google session binding is created at sign-in; without it the session cannot use credentials.
    if (!account.googleAccount) return deny(MESSAGING_ERROR_CODE.authenticationRequired);
    return { allowed: true, context: { authorizationPurpose: MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader, resourceId: command.connectionId,
      actorUserId: account.userId, sessionId: account.session.id, accountId: account.googleAccount.id, subject: account.googleAccount.subject,
      tribeId: command.tribeId, connectionId: connection.id, connectionVersion: connection.version, environment: security.environment, securityEpoch: security.securityEpoch,
      operation: command.operation, requestId: command.requestId, secretRef: connection.secretRef,
    } };
  }
}

/**
 * Resolves the authority of a sensitive write that may be a retry. A platform denial is definitive ("nothing was registered")
 * only for a new original: a write whose original the ledger already holds, or whose registration cannot be checked, stays
 * unresolved under its operation id, so the browser keeps it and recovers it once the platform is back.
 */
export class ResolveMessagingWriteContextUseCase {
  /**
   * @param resolver - Current sensitive authority, unchanged for every outcome other than a platform denial.
   * @param accounts - Current account that owns the original, read only after a platform denial.
   * @param originals - Ledger lookup of the exact original, without locking it or reading its intent.
   */
  constructor(private readonly resolver: Pick<ResolveMessagingContextUseCase, "execute">, private readonly accounts: MessagingAccountProvider, private readonly originals: MessagingOriginalOperationLookup) {}

  /**
   * @param command - Boundary-validated resource identity and fixed server operation; only a write names its operation id.
   * @returns The resolver outcome, except a platform denial of a registered or unverifiable original, which becomes unresolved.
   */
  async execute(command: ResolveMessagingContextCommand): ReturnType<ResolveMessagingContextUseCase["execute"]> {
    const outcome = await this.resolver.execute(command);
    const { operationId } = command;
    if (outcome.allowed || outcome.failure.code !== MESSAGING_ERROR_CODE.platformSecurityUnavailable || !operationId) return outcome;
    const unresolved = (cause: unknown) => ({ allowed: false as const, failure: messagingFailure(MESSAGING_ERROR_CODE.operationUnresolved, { cause, operation: { operationId, state: OPERATION_STATE.started } }) });
    try {
      const account = await this.accounts.getAuthenticatedAccount();
      // Without a current account the original belongs to nobody who can recover it here; the definitive denial stands.
      if (!account) return outcome;
      const registered = await this.originals.isRegistered({ actorUserId: account.userId, tribeId: command.tribeId, operation: command.operation, operationId });
      return registered ? unresolved(outcome.failure.cause) : outcome;
    } catch (lookupError) {
      return unresolved(new AggregateError([outcome.failure.cause, lookupError], "ResolveMessagingWriteContext:execute original lookup failed", { cause: lookupError }));
    }
  }
}

/** Private backend operation; its secret must never be projected to a page or JSON response. */
export class LoadAuthorizedMessagingSecretUseCase {
  /** Injects the own resolver and store; no provider operation is performed by this use case. */
  constructor(private readonly resolver: Pick<ResolveMessagingContextUseCase, "execute">, private readonly secrets: MessagingSecretStore) {}

  /**
   * Gates backend-only credential access on current account/resource authorization.
   * @param command - Own validated resource and fixed sensitive operation scope.
   * @returns Private credential/context for an adapter, or a failure before SecretStore.
   */
  async execute(command: Parameters<ResolveMessagingContextUseCase["execute"]>[0]) {
    const authorization = await this.resolver.execute(command);
    if (!authorization.allowed) return authorization;
    try {
      const secret = await this.secrets.loadAuthorizedSecret(authorization.context);
      return { allowed: true as const, context: authorization.context, secret };
    } catch (error) {
      if (error instanceof MessagingSecretAccessError) return { allowed: false as const, failure: messagingFailure(error.code, { cause: error }) };
      throw error;
    }
  }
}
