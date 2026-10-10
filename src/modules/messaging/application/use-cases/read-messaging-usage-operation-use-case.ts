/** Recovers an original usage operation under current leadership without mutation recency. @module read-messaging-usage-operation-use-case */
import type { MessagingAccountProvider, MessagingAuthorizationReader } from "../../domain/repositories/messaging-repositories";
import type { MessagingUsageOperationReader } from "../../domain/repositories/messaging-usage-operation-reader";
import { messagingUsageOperationRecoverySchema } from "../results/messaging-usage-operation-result";
import { messagingFailure } from "../results/messaging-errors";
import { MessagingUsageOperationError } from "../../domain/errors/messaging-usage-operation-error";
import { MessagingSecretAccessError } from "../../domain/errors/messaging-secret-access-error";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

/** This reader cannot initialize, renew leases, write policy, send messages or load credentials. */
export class ReadMessagingUsageOperationUseCase {
  /** @param accounts - Native current account. @param authorization - Canonical current role. @param reader - Read-only original owner. @param clock - Post-wait session clock. */
  constructor(private readonly accounts: MessagingAccountProvider, private readonly authorization: Pick<MessagingAuthorizationReader, "getCurrentLeadership">, private readonly reader: MessagingUsageOperationReader, private readonly clock: () => Date) {}

  /** @param query - Once-validated tribe, original UUID and correlation. @returns Original own DTO or safe failure without substituting the current version. */
  async execute(query: { tribeId: string; operationId: string; requestId: string }) {
    try {
      const account = await this.accounts.getAuthenticatedAccount();
      if (!account || !isAuthenticatedSessionLive(account.session.expiresAt, this.clock())) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
      const authorize = async () => {
        const facts = await this.authorization.getCurrentLeadership(query.tribeId, account.userId);
        const current = await this.accounts.getAuthenticatedAccount(), now = this.clock();
        if (!current || current.userId !== account.userId || current.session.id !== account.session.id || !Number.isFinite(now.getTime()) || !Number.isFinite(current.session.expiresAt.getTime()) || now >= current.session.expiresAt) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.authenticationRequired);
        if (!facts || facts.tribeId !== query.tribeId || facts.leaderUserId !== account.userId || facts.membership?.userId !== account.userId || facts.membership.role !== TRIBE_MEMBER_ROLE.leader || facts.membership.status !== TRIBE_MEMBERSHIP_STATUS.active) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
      };
      await authorize();
      const value = await this.reader.read({ actorUserId: account.userId, sessionId: account.session.id, tribeId: query.tribeId, requestId: query.requestId }, query.operationId);
      await authorize();
      if (!value) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const parsed = messagingUsageOperationRecoverySchema.safeParse(value);
      if (!parsed.success || parsed.data.operationId.toLowerCase() !== query.operationId.toLowerCase()) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: parsed.data };
    } catch (error) { return { ok: false as const, failure: messagingFailure(error instanceof MessagingUsageOperationError || error instanceof MessagingSecretAccessError ? error.code : MESSAGING_ERROR_CODE.unexpectedFailure, { cause: error }) }; }
  }
}
