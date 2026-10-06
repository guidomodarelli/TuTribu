/** Resolves current server-owned scope before any secret access or provider operation. */
import { evaluateRecentAuthentication } from "@/src/modules/auth/domain/policies/recent-authentication";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_AUTHORIZATION_PURPOSE, MESSAGING_CREDENTIAL_USABLE_STATES } from "@/src/modules/messaging/constants/messaging-connection";
import { messagingFailure, type MessagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";
import type { AuthorizedMessagingContext, MessagingAccountProvider, MessagingAuthorizationReader, MessagingLeadershipFacts, MessagingSecretStore, MessagingSecurityFactsProvider } from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** Checks the authoritative tribe leader and current active membership, not a cached role. */
function hasCurrentLeadership(leadership: MessagingLeadershipFacts | null, tribeId: string, userId: string): leadership is MessagingLeadershipFacts {
  return Boolean(leadership && leadership.tribeId === tribeId && leadership.leaderUserId === userId
    && leadership.membership?.userId === userId && leadership.membership.role === TRIBE_MEMBER_ROLE.leader
    && leadership.membership.status === TRIBE_MEMBERSHIP_STATUS.active);
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
   * Resource/tribe/user/account/session/operation recency are all checked from
   * current own readers. Failed authority precedes reading a connection secret.
   * The SQL writer and SecretStore must repeat authority under their locks.
   *
   * @param command - Boundary-validated resource identity and fixed server operation.
   * @returns Private context or a safe expected failure, without cross-tenant details.
   */
  async execute(command: { tribeId: string; connectionId: string; operation: string; requestId: string }): Promise<{ context: AuthorizedMessagingContext; allowed: true } | { allowed: false; failure: MessagingFailure }> {
    const deny = (code: MessagingFailure["code"]) => ({ allowed: false as const, failure: messagingFailure(code) });
    const initialAccount = await this.accounts.getAuthenticatedAccount();
    if (!initialAccount) return deny(MESSAGING_ERROR_CODE.authenticationRequired);
    const initialLeadership = await this.authorization.getCurrentLeadership(command.tribeId, initialAccount.userId);
    if (!hasCurrentLeadership(initialLeadership, command.tribeId, initialAccount.userId)) return deny(MESSAGING_ERROR_CODE.permissionDenied);
    const connection = await this.authorization.getConnection(command.tribeId, command.connectionId);
    if (!connection || connection.tribeId !== command.tribeId || connection.id !== command.connectionId || connection.contributedByUserId !== initialAccount.userId || connection.retiredAt !== null || !connection.secretRef || !Number.isInteger(connection.version) || connection.version < 1) return deny(MESSAGING_ERROR_CODE.resourceUnavailable);
    if (!MESSAGING_CREDENTIAL_USABLE_STATES.has(connection.state)) return deny(MESSAGING_ERROR_CODE.connectionIncomplete);
    const security = await this.security.getCurrentSecurityFacts();
    if (security.recoveryLocked !== false || !security.environment || !security.securityEpoch || connection.securityEpoch !== security.securityEpoch) return deny(MESSAGING_ERROR_CODE.connectionIncomplete);
    // Resource/security reads may wait. Resolve current session/leadership again;
    // the concrete writer/SecretStore repeats these facts under its own locks.
    const account = await this.accounts.getAuthenticatedAccount();
    if (!account || account.userId !== initialAccount.userId || account.session.id !== initialAccount.session.id) return deny(MESSAGING_ERROR_CODE.authenticationRequired);
    const leadership = await this.authorization.getCurrentLeadership(command.tribeId, account.userId);
    if (!hasCurrentLeadership(leadership, command.tribeId, account.userId)) return deny(MESSAGING_ERROR_CODE.permissionDenied);
    const now = this.clock();
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(account.session.expiresAt.getTime()) || now.getTime() >= account.session.expiresAt.getTime()) return deny(MESSAGING_ERROR_CODE.authenticationRequired);
    if (!account.googleAccount) return deny(MESSAGING_ERROR_CODE.reauthenticationRequired);
    const scope = { userId: account.userId, sessionId: account.session.id, accountId: account.googleAccount.id, subject: account.googleAccount.subject, tribeId: command.tribeId, operation: command.operation, resourceId: command.connectionId };
    const evidence = account.recentAuthentication.find((candidate) => evaluateRecentAuthentication({ now, scope, evidence: candidate, sessionActive: true, currentLeaderUserId: leadership.leaderUserId }).allowed);
    if (!evidence?.authenticatedAt) return deny(MESSAGING_ERROR_CODE.reauthenticationRequired);
    return { allowed: true, context: { authorizationPurpose: MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader, resourceId: command.connectionId,
      actorUserId: account.userId, sessionId: account.session.id, accountId: account.googleAccount.id, subject: account.googleAccount.subject,
      tribeId: command.tribeId, connectionId: connection.id, connectionVersion: connection.version, environment: security.environment, securityEpoch: security.securityEpoch,
      operation: command.operation, requestId: command.requestId, authenticatedAt: evidence.authenticatedAt, validUntil: evidence.validUntil, secretRef: connection.secretRef,
    } };
  }
}

/** Private backend operation; its secret must never be projected to a page or JSON response. */
export class LoadAuthorizedMessagingSecretUseCase {
  /** Injects the own resolver and store; no provider operation is performed by this use case. */
  constructor(private readonly resolver: ResolveMessagingContextUseCase, private readonly secrets: MessagingSecretStore) {}

  /**
   * Gates backend-only credential access on current account/resource authorization.
   * @param command - Own validated resource and fixed sensitive operation scope.
   * @returns Private credential/context for an adapter, or a failure before SecretStore.
   */
  async execute(command: Parameters<ResolveMessagingContextUseCase["execute"]>[0]) {
    const authorization = await this.resolver.execute(command);
    if (!authorization.allowed) return authorization;
    const secret = await this.secrets.loadAuthorizedSecret(authorization.context);
    return { allowed: true as const, context: authorization.context, secret };
  }
}
