/** Commits explicit usage initialization and versioned edits with their original operation result. @module postgres-messaging-usage-operations */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { MessagingUsageContext, MessagingUsageSensitiveContext, MessagingUsageUpdate, MessagingUsageOperations } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";
import type { MessagingUsagePolicyResult, MessagingUsagePolicyStateResult } from "@/src/modules/messaging/application/results/messaging-usage-policy-result";
import { messagingUsagePolicySchema, messagingUsagePolicyStateSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { MessagingUsageOperationError } from "@/src/modules/messaging/domain/errors/messaging-usage-operation-error";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_USAGE_POLICY_STATE } from "@/src/modules/messaging/constants/messaging-limits";
import { projectMessagingUsagePolicy, type MessagingUsagePolicyRow } from "./postgres-messaging-usage-projection";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionOperationCommand, AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { authorizeMessagingUsage } from "./postgres-messaging-usage-authorizer";
import { executeMessagingLedger } from "./execute-messaging-ledger";

/** Binds all checkouts to the same current server principal, never body-selected identity. */
type UsageDatabaseExecutor = <Result>(context: MessagingUsageContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Consumed PostgreSQL configuration columns, not a runtime schema for a database row. */
type PolicyRow = MessagingUsagePolicyRow;

/** Configuration owns only this tribe's editable policy; quota history, proofs and connections are independent. */
export class PostgresMessagingUsageOperations implements MessagingUsageOperations<MessagingUsagePolicyResult, MessagingUsagePolicyStateResult> {
  /**
   * @param execute - Guarded current-actor executor used independently for claim, effect and reconciliation.
   * @param readSecurityConfig - Local keyring reader for the shared operation ledger; no provider call under locks.
   */
  constructor(private readonly execute: UsageDatabaseExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** Reads only the exact tribe's configuration, acquiring its row lock after authority and the ledger. */
  private async readLocked(database: RequestDatabase, tribeId: string, mutation: boolean): Promise<PolicyRow | undefined> {
    return (await database.execute<PolicyRow>(sql`select version,allowed_countries,verification_daily_limit,notification_daily_limit,platform_verification_daily_maximum,platform_notification_daily_maximum from public.messaging_usage_policies where tribe_id=${tribeId} ${mutation ? sql`for update` : sql`for share`}`)).rows[0];
  }

  /** Projects own aggregate consumption without actors, recipients, fingerprints or cross-tribe data. */
  private async project(database: RequestDatabase, context: MessagingUsageContext, row: PolicyRow): Promise<MessagingUsagePolicyResult> {
    const result = await projectMessagingUsagePolicy(database, context.tribeId, row);
    await authorizeMessagingUsage(database, context);
    return result;
  }

  /** Wraps only closed own failures; private PostgreSQL text is retained solely as cause. */
  private failure(error: unknown): MessagingUsageOperationError {
    if (error instanceof MessagingUsageOperationError) return error;
    if (error instanceof MessagingSecretAccessError) return new MessagingUsageOperationError(error.code, { cause: error });
    if (error instanceof AdmissionOperationError) {
      const code = Object.values(MESSAGING_ERROR_CODE).find((candidate) => candidate === error.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure;
      return new MessagingUsageOperationError(code, { cause: error, ...(error.code === ADMISSION_ERROR_CODE.operationUnresolved && error.operationId ? { operationId: error.operationId } : {}) });
    }
    return new MessagingUsageOperationError(MESSAGING_ERROR_CODE.unexpectedFailure, { cause: error });
  }

  /**
   * Queries absence without a write or fabricated persisted resource version.
   * @param context - Current server session and authorized tribe; no recency required for reading.
   * @returns Current own configuration or not_configured, without initialization or external work.
   */
  async read(context: MessagingUsageContext): Promise<MessagingUsagePolicyStateResult> {
    try {
      return await this.execute(context, async (database) => {
        await authorizeMessagingUsage(database, context);
        const row = await this.readLocked(database, context.tribeId, false);
        const result = row ? { state: MESSAGING_USAGE_POLICY_STATE.configured, policy: await this.project(database, context, row) } : { state: MESSAGING_USAGE_POLICY_STATE.notConfigured, policy: null };
        await authorizeMessagingUsage(database, context);
        return messagingUsagePolicyStateSchema.parse(result);
      });
    } catch (error) { throw this.failure(error); }
  }

  /** Composes the real ledger with an exact mutation operation and current authority at every phase. */
  private ledger(context: MessagingUsageSensitiveContext, operation: MessagingUsageSensitiveContext["operation"]): PostgresAdmissionOperationRepository {
    if (context.operation !== operation) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.permissionDenied);
    return new PostgresAdmissionOperationRepository((run) => executeMessagingLedger(() => this.execute(context, run)), async (database) => {
      try { await authorizeMessagingUsage(database, context); return true; }
      catch (error) {
        if (error instanceof MessagingUsageOperationError) throw this.ledgerFailure(error);
        throw error;
      }
    }, this.readSecurityConfig);
  }

  /**
   * Adapts an owner outcome to the reused ledger's closed namespace while preserving its private cause.
   * @param error - Actual usage-owner failure; a category-specific limit maps to the ledger limit.
   * @returns A compatible private ledger failure without expanding the admission owner's public codes.
   */
  private ledgerFailure(error: MessagingUsageOperationError): AdmissionOperationError {
    const code = error.code === MESSAGING_ERROR_CODE.credentialValidationLimitReached
      ? ADMISSION_ERROR_CODE.usageLimitReached : error.code;
    return new AdmissionOperationError(code, { cause: error });
  }

  /**
   * Preserves expected callback failures and reconciles a possibly committed original effect without rerunning it.
   * @param ledger - Already bound current-actor ledger and exact sensitive operation.
   * @param command - Normalized original identity, including the unchanged expected resource version.
   * @param mutate - DB-only callback; no new checkout, SDK or provider call is allowed here.
   * @returns The confirmed original result, including recovered response loss, or genuine unfinished work.
   */
  private async run(ledger: PostgresAdmissionOperationRepository, command: AdmissionOperationCommand, mutate: (database: RequestDatabase) => Promise<MessagingUsagePolicyResult>): Promise<AdmissionOperationResult<MessagingUsagePolicyResult>> {
    try {
      return await ledger.run(command, messagingUsagePolicySchema, async (database) => {
        try { return await mutate(database); }
        catch (error) {
          if (error instanceof MessagingUsageOperationError) throw this.ledgerFailure(error);
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.operationUnresolved) {
        try {
          const registered = await ledger.read(command, messagingUsagePolicySchema);
          if (registered?.state === "completed") return registered;
        } catch (reconciliationError) {
          if (reconciliationError instanceof AdmissionOperationError) throw this.failure(reconciliationError);
          throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.operationUnresolved, { cause: new AggregateError([error, reconciliationError], "Messaging usage reconciliation failed", { cause: error }), operationId: command.idempotencyKey });
        }
      }
      throw this.failure(error);
    }
  }

  /**
   * Explicitly initializes database-owned defaults under unique tribe identity.
   * @param context - Current sensitive leader with recency for this exact initialization.
   * @param operationId - Original client operation UUID; private ledger identity is assigned by its owner.
   * @returns Original committed policy or registered progress, never a reset of an existing policy.
   */
  async initialize(context: MessagingUsageSensitiveContext, operationId: string) {
    try {
      const ledger = this.ledger(context, REAUTHENTICATION_OPERATION.initializeMessagingUsage);
      return await this.run(ledger, { actorUserId: context.actorUserId, tribeId: context.tribeId, operationType: context.operation, idempotencyKey: operationId, intent: { confirmed: true } }, async (database) => {
        await database.execute(sql`insert into public.messaging_usage_policies(tribe_id,changed_by_user_id) values (${context.tribeId},${context.actorUserId}) on conflict(tribe_id) do nothing`);
        const row = await this.readLocked(database, context.tribeId, true);
        if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
        return this.project(database, context, row);
      });
    } catch (error) { throw this.failure(error); }
  }

  /**
   * Recovers an identical original commit before applying CAS to a new intent.
   * @param context - Current sensitive leader with recency for this exact edit.
   * @param input - Boundary-validated countries/quotas, current expected version and explicit confirmation.
   * @returns Committed configuration snapshot; it does not claim the historical replay is today's current state.
   */
  async update(context: MessagingUsageSensitiveContext, input: MessagingUsageUpdate) {
    try {
      const ledger = this.ledger(context, REAUTHENTICATION_OPERATION.updateMessagingUsage);
      const allowedCountries = [...input.allowedCountries].sort();
      const intent = { expectedVersion: input.expectedVersion, allowedCountries, verificationDailyLimit: input.verificationDailyLimit, notificationDailyLimit: input.notificationDailyLimit, confirmed: input.confirmed };
      return await this.run(ledger, { actorUserId: context.actorUserId, tribeId: context.tribeId, operationType: context.operation, idempotencyKey: input.operationId, intent }, async (database) => {
        const row = await this.readLocked(database, context.tribeId, true);
        if (!row || row.version !== input.expectedVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.usagePolicyConflict);
        if (input.verificationDailyLimit > row.platform_verification_daily_maximum || input.notificationDailyLimit > row.platform_notification_daily_maximum) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
        const currentCountries = [...row.allowed_countries].sort();
        const unchanged = input.verificationDailyLimit === row.verification_daily_limit && input.notificationDailyLimit === row.notification_daily_limit && allowedCountries.length === currentCountries.length && allowedCountries.every((country, index) => country === currentCountries[index]);
        if (!unchanged) {
          await authorizeMessagingUsage(database, context);
          await database.execute(sql`update public.messaging_usage_policies set allowed_countries=${sql.param(allowedCountries)}::text[],verification_daily_limit=${input.verificationDailyLimit},notification_daily_limit=${input.notificationDailyLimit},version=version+1,changed_by_user_id=${context.actorUserId},updated_at=clock_timestamp() where tribe_id=${context.tribeId} and version=${input.expectedVersion}`);
          const current = await this.readLocked(database, context.tribeId, true);
          if (!current) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.resourceUnavailable);
          return this.project(database, context, current);
        }
        return this.project(database, context, row);
      });
    } catch (error) { throw this.failure(error); }
  }
}
