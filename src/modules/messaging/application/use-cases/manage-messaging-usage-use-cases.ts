/** Derives current usage authority before reads or explicit configuration, independently of connections. @module manage-messaging-usage-use-cases */
import type { MessagingAccountProvider, MessagingAuthorizationReader } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingUsageContext, MessagingUsageSensitiveContext, MessagingUsageOperations, MessagingUsageUpdate } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";
import type { MessagingUsagePolicyResult, MessagingUsagePolicyStateResult } from "@/src/modules/messaging/application/results/messaging-usage-policy-result";
import { messagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";
import { MessagingUsageOperationError } from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_USAGE_LIMIT } from "@/src/modules/messaging/constants/messaging-limits";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ResolveMessagingTribeManagementUseCase } from "./resolve-messaging-tribe-management-use-case";

/** Boundary input contains resource/correlation only; the browser cannot select the account or session. */
type UsageQuery = { tribeId: string; requestId: string };

/** Current account/role/recency orchestration; persistence rechecks its authority under actual SQL locks. */
export class ManageMessagingUsageUseCases {
  /**
   * @param accounts - Current private global session projection, with no provider tokens.
   * @param authorization - Own current leadership facts; connection lookup is deliberately unnecessary.
   * @param operations - Usage owner with DB-only effects and original operation recovery.
   * @param clock - Fresh time sampled after awaited current facts.
   */
  constructor(accounts: MessagingAccountProvider, authorization: Pick<MessagingAuthorizationReader, "getCurrentLeadership">, private readonly operations: MessagingUsageOperations<MessagingUsagePolicyResult, MessagingUsagePolicyStateResult>, clock: () => Date) { this.authority = new ResolveMessagingTribeManagementUseCase(accounts, authorization, clock); }
  private readonly authority: ResolveMessagingTribeManagementUseCase;

  /** Resolves only tribe management; absent recency closes the sensitive action, while reads remain available. */
  private async resolve(query: UsageQuery, operation?: MessagingUsageSensitiveContext["operation"]): Promise<MessagingUsageContext | MessagingUsageSensitiveContext> {
    return operation ? this.authority.execute(query, operation) : this.authority.execute(query);
  }

  /** Keeps unexpected detail private and progress present only when the ledger proved its original identity. */
  private failure(error: unknown) {
    const code = error instanceof MessagingUsageOperationError || error instanceof MessagingSecretAccessError ? error.code : MESSAGING_ERROR_CODE.unexpectedFailure;
    return { ok: false as const, failure: messagingFailure(code, { cause: error, ...(error instanceof MessagingUsageOperationError && error.code === MESSAGING_ERROR_CODE.operationUnresolved && error.operationId ? { operation: { operationId: error.operationId, state: OPERATION_STATE.started } } : {}) }) };
  }

  /**
   * Returns absence without claiming a resource; defaults are presentation data without a version.
   * @param query - Boundary-resolved tribe and server correlation id.
   * @returns Current state plus separate defaults, or an expected safe failure.
   */
  async read(query: UsageQuery) {
    try {
      const context = await this.resolve(query);
      return { ok: true as const, value: await this.operations.read(context), defaults: { allowedCountries: [] as string[], verificationDailyLimit: MESSAGING_USAGE_LIMIT.verificationDailyDefault, notificationDailyLimit: MESSAGING_USAGE_LIMIT.notificationDailyDefault } };
    } catch (error) { return this.failure(error); }
  }

  /**
   * Starts configuration only after the explicit action and exact tribe-scoped global recency.
   * @param input - Boundary-validated confirmation/idempotency, without countries, quotas or a client version.
   * @returns Original initialized/existing snapshot or registered unfinished work, without an SDK call.
   */
  async initialize(input: UsageQuery & { operationId: string; confirmed: true }) {
    try {
      const context = await this.resolve(input, REAUTHENTICATION_OPERATION.initializeMessagingUsage);
      if (!("operation" in context)) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.reauthenticationRequired);
      return { ok: true as const, value: await this.operations.initialize(context, input.operationId) };
    } catch (error) { return this.failure(error); }
  }

  /**
   * Preserves draft intent/version and leaves replay before CAS to the authoritative owner.
   * @param input - Boundary-validated countries, quotas and original expectedVersion/operation identity.
   * @returns Original committed snapshot, registered progress or a typed conflict requiring a new confirmation.
   */
  async update(input: UsageQuery & MessagingUsageUpdate) {
    try {
      const context = await this.resolve(input, REAUTHENTICATION_OPERATION.updateMessagingUsage);
      if (!("operation" in context)) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.reauthenticationRequired);
      return { ok: true as const, value: await this.operations.update(context, input) };
    } catch (error) { return this.failure(error); }
  }
}
