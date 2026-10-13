/** Commits tribe-wide credential checks without acquiring or dispatching credential bytes. @module postgres-credential-validation-budget */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { CredentialValidationBudget, CredentialValidationBudgetCommand, CredentialValidationBudgetResult } from "@/src/modules/messaging/domain/repositories/credential-validation-budget";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { authorizeMessagingSecret, messagingSecretLifetimeIsCurrent } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-secret-authorizer";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MessagingUsageBudgetError } from "@/src/modules/messaging/domain/errors/messaging-usage-budget-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_USAGE_LIMIT } from "@/src/modules/messaging/constants/messaging-limits";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { CREDENTIAL_VALIDATION_LOCK_DOMAIN, CREDENTIAL_VALIDATION_OPERATION_LOCK_DOMAIN, CREDENTIAL_VALIDATION_WINDOW_MS, CREDENTIAL_VALIDATION_STORAGE_OPERATION } from "@/src/modules/messaging/constants/credential-validation-budget";
import { CODE_REQUEST_EVENT } from "@/src/modules/messaging/constants/code-request-budget";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** Runs one current actor's callback through the existing guarded transaction and commits before returning. */
type CredentialValidationExecutor = <Result>(context: AuthorizedMessagingContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Projects consumed private event identity without schema-validating a PostgreSQL row. */
type ValidationEventRow = { tribe_id: string; actor_user_id: string | null; purpose: string; credential_connection_id: string | null; credential_connection_version: number | null; occurred_at: string | Date };

/** A missing commit reply does not grant another credential-validation RPC. */
export class PostgresCredentialValidationBudget implements CredentialValidationBudget {
  /**
   * @param execute - Existing guarded executor for the server-derived actor, without retries.
   * @param readSecurityConfig - Current external epoch/recovery/keyrings, without RPC under locks.
   */
  constructor(private readonly execute: CredentialValidationExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /**
   * Rechecks actual session, account, recency, canonical leader and live immutable resource metadata.
   * @param database - Current transaction, already holding its own identity/resource locks.
   * @param context - Original private validation action and resource.
   * @returns Current SQL time after the last awaited authority/configuration read.
   */
  private async authorize(database: RequestDatabase, context: AuthorizedMessagingContext): Promise<Date> {
    if (context.authorizationPurpose !== MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader
      || context.operation !== REAUTHENTICATION_OPERATION.validateMessagingConnection
      || context.resourceId !== context.connectionId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
    const authority = await authorizeMessagingSecret(database, context);
    const config = await this.readSecurityConfig();
    if (config.recoveryLocked || config.environment !== context.environment || config.securityEpoch !== context.securityEpoch
      || !config.keyrings.credential.keys.has(authority.keyId)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
    const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    if (!messagingSecretLifetimeIsCurrent(authority, now)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.reauthenticationRequired);
    return now;
  }

  /**
   * Counts every credential version in the same tribe moving window and dedupes the original operation.
   * @param command - Backend original operation/resource identity; not a browser permission token.
   * @returns Accounting after commit, or an expected denial after rollback/current checks.
   * @throws MessagingUsageBudgetError when the actual persistence effect is unresolved.
   */
  async reserve(command: CredentialValidationBudgetCommand): Promise<CredentialValidationBudgetResult> {
    const { context, operationId } = command;
    try {
      return await this.execute(context, async (database): Promise<CredentialValidationBudgetResult> => {
        await this.authorize(database, context);
        await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([CREDENTIAL_VALIDATION_OPERATION_LOCK_DOMAIN, operationId])},0))`);
        await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([CREDENTIAL_VALIDATION_LOCK_DOMAIN, context.tribeId])},0))`);
        const now = await this.authorize(database, context);
        const prior = (await database.execute<ValidationEventRow>(sql`select tribe_id,actor_user_id,purpose,credential_connection_id,credential_connection_version,occurred_at from public.messaging_usage_events where event_type=${CODE_REQUEST_EVENT.credential} and operation_id=${operationId}`)).rows[0];
        if (prior) {
          if (prior.tribe_id !== context.tribeId || prior.actor_user_id !== context.actorUserId
            || prior.purpose !== REAUTHENTICATION_OPERATION.validateMessagingConnection
            || prior.credential_connection_id !== context.connectionId || prior.credential_connection_version !== context.connectionVersion) {
            return { outcome: "denied", code: MESSAGING_ERROR_CODE.idempotencyConflict };
          }
          await this.authorize(database, context);
          return { outcome: "already_reserved", operationId, reservedAt: new Date(prior.occurred_at) };
        }
        const hourStart = new Date(now.getTime() - CREDENTIAL_VALIDATION_WINDOW_MS);
        const count = (await database.execute<{ total: number }>(sql`select count(*)::integer as total from public.messaging_usage_events where tribe_id=${context.tribeId} and event_type=${CODE_REQUEST_EVENT.credential} and occurred_at>${hourStart}`)).rows[0].total;
        if (count >= MESSAGING_USAGE_LIMIT.credentialValidationsHourly) {
          await this.authorize(database, context);
          return { outcome: "denied", code: MESSAGING_ERROR_CODE.credentialValidationLimitReached };
        }
        const finalNow = await this.authorize(database, context);
        const event = (await database.execute<{ occurred_at: Date | string }>(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,event_type,operation_id,occurred_at,credential_connection_id,credential_connection_version) values (${context.tribeId},${context.actorUserId},${REAUTHENTICATION_OPERATION.validateMessagingConnection},${CODE_REQUEST_EVENT.credential},${operationId},${finalNow},${context.connectionId},${context.connectionVersion}) returning occurred_at`)).rows[0];
        await this.authorize(database, context);
        return { outcome: "reserved", operationId, reservedAt: new Date(event.occurred_at) };
      });
    } catch (error) {
      if (error instanceof MessagingSecretAccessError) return { outcome: "denied", code: error.code };
      if (error instanceof MessagingUsageBudgetError) throw error;
      throw new MessagingUsageBudgetError(MESSAGING_ERROR_CODE.operationUnresolved, { cause: error, operation: CREDENTIAL_VALIDATION_STORAGE_OPERATION });
    }
  }
}
