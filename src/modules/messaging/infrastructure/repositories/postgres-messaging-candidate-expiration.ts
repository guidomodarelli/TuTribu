/** Retires abandoned candidate versions atomically under current backend authority without reading keys or sending messages. @module postgres-messaging-candidate-expiration */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingCandidateExpiration, MessagingCandidateExpirationResult } from "../../domain/repositories/messaging-candidate-expiration";
import { assessMessagingCandidateExpiration } from "../../domain/policies/messaging-candidate-expiration";
import { MessagingCandidateExpirationError } from "../../domain/errors/messaging-candidate-expiration-error";
import { MESSAGING_CANDIDATE_MAINTENANCE, MESSAGING_EXPIRED_CANDIDATE_PURGE_WINDOW_MS } from "../../constants/messaging-candidate-expiration";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_CONNECTION_STATE } from "../../constants/messaging-connection";
import { MESSAGING_CANDIDATE_IDLE_LIFETIME_MS } from "../../constants/messaging-secret-access";
import { retireDiagnosticChallenges } from "./postgres-retired-diagnostic-challenges";

/** Uses the caller's guarded maintenance transaction and publishes only after its confirmed commit. */
export type CandidateExpirationDatabaseExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Rechecks host authority/recovery; an optional transaction supports authoritative own maintenance gates. */
export type CandidateExpirationGate = (database?: RequestDatabase) => Promise<boolean>;
/** Contains only the exact current locked resource metadata used by this adapter. */
type CandidateResource = { connection_id: string; tribe_id: string; candidate_version: number; connection_version: number; is_selected: boolean; selected_version: number | null; is_candidate: boolean; state: string; connection_retired_at: Date | string | null; resource_retired_at: Date | string | null; last_activity_at: Date | string; secret_ref: string | null };

/** Keeps independent candidate and selected versions distinct, including both slots on one connection. */
export class PostgresMessagingCandidateExpiration implements MessagingCandidateExpiration {
  /** @param execute - Existing guarded maintenance executor. @param authorize - Current private backend authority. @param readRecoveryLock - Current restore gate without loading a keyring. */
  constructor(private readonly execute: CandidateExpirationDatabaseExecutor, private readonly authorize: CandidateExpirationGate, private readonly readRecoveryLock: CandidateExpirationGate) {}

  /** @param database - Current protected transaction when available. @returns After the current authority and recovery gates permit this operation. @throws MessagingCandidateExpirationError when either gate is unavailable. */
  private async assertAuthority(database?: RequestDatabase): Promise<void> {
    if (!await this.authorize(database)) throw new MessagingCandidateExpirationError(MESSAGING_ERROR_CODE.permissionDenied);
    if (await this.readRecoveryLock(database)) throw new MessagingCandidateExpirationError(MESSAGING_ERROR_CODE.connectionIncomplete);
    if (!await this.authorize(database)) throw new MessagingCandidateExpirationError(MESSAGING_ERROR_CODE.permissionDenied);
  }

  /** @param command - Backend-owned bounded batch. @returns Confirmed retired/purged counts without private resources. @throws MessagingCandidateExpirationError for invalid bounds, withdrawn authority or an indeterminate commit. */
  async expire(command: { limit: number }): Promise<MessagingCandidateExpirationResult> {
    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > MESSAGING_CANDIDATE_MAINTENANCE.maximumBatchSize) throw new MessagingCandidateExpirationError(MESSAGING_ERROR_CODE.invalidInput);
    try {
      await this.assertAuthority();
      return await this.execute(async (database) => {
        await this.assertAuthority(database);
        const selected = (await database.execute<{ connection_id: string; tribe_id: string; candidate_version: number }>(sql`select connection_id,tribe_id,candidate_version from public.claim_expired_messaging_candidates(${command.limit})`)).rows;
        const result: MessagingCandidateExpirationResult = { expired: 0, purgedImmediately: 0 };
        const actorUserId=(await database.execute<{actor_user_id:string|null}>(sql`select public.current_app_user_id() as actor_user_id`)).rows[0].actor_user_id;
        for (const scope of selected) {
          await this.assertAuthority(database);
          const row = (await database.execute<CandidateResource>(sql`select connection.id as connection_id,connection.tribe_id,connection.candidate_version,connection.version as connection_version,connection.is_selected,connection.selected_version,connection.is_candidate,connection.state,connection.retired_at as connection_retired_at,resource.retired_at as resource_retired_at,resource.last_activity_at,resource.secret_ref from public.tenant_messaging_connections connection join public.messaging_connection_versions resource on resource.connection_id=connection.id and resource.tribe_id=connection.tribe_id and resource.version=${scope.candidate_version} where connection.id=${scope.connection_id} and connection.tribe_id=${scope.tribe_id} for update of connection,resource`)).rows[0];
          if (!row || row.candidate_version !== scope.candidate_version) continue;
          const now = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
          const assessment = assessMessagingCandidateExpiration({ isSelected: row.selected_version === row.candidate_version, isCandidate: row.is_candidate, connectionRetiredAt: row.connection_retired_at ? new Date(row.connection_retired_at) : null, resourceRetiredAt: row.resource_retired_at ? new Date(row.resource_retired_at) : null, lastActivityAt: new Date(row.last_activity_at), now });
          if (!assessment.eligible) continue;
          // Keep PostgreSQL's original microsecond precision instead of replacing the immutable lifetime with a rounded Date.
          await retireDiagnosticChallenges(database, { tribeId: row.tribe_id, connectionId: row.connection_id, connectionVersion: row.candidate_version, actorUserId, operationId: null, reason: MESSAGING_CANDIDATE_MAINTENANCE.retirementReason });
          await database.execute(sql`update public.messaging_connection_versions set retired_at=last_activity_at+${MESSAGING_CANDIDATE_IDLE_LIFETIME_MS}::bigint*interval '1 millisecond',purge_after=last_activity_at+(${MESSAGING_CANDIDATE_IDLE_LIFETIME_MS}::bigint+${MESSAGING_EXPIRED_CANDIDATE_PURGE_WINDOW_MS}::bigint)*interval '1 millisecond' where connection_id=${row.connection_id} and tribe_id=${row.tribe_id} and version=${row.candidate_version} and retired_at is null`);
          if (row.secret_ref) {
            await database.execute(sql`update public.messaging_secret_envelopes envelope set retired_at=resource.retired_at,purge_after=resource.purge_after from public.messaging_connection_versions resource where envelope.secret_ref=${row.secret_ref} and envelope.connection_id=resource.connection_id and envelope.connection_version=resource.version and resource.connection_id=${row.connection_id} and resource.tribe_id=${row.tribe_id} and resource.version=${row.candidate_version} and envelope.retired_at is null`);
            const purged = (await database.execute(sql`update public.messaging_secret_envelopes set iv=null,ciphertext=null,purged_at=clock_timestamp() where secret_ref=${row.secret_ref} and retired_at is not null and purged_at is null and purge_after<=clock_timestamp() returning secret_ref`)).rows;
            result.purgedImmediately += purged.length;
          }
          await database.execute(sql`update public.tenant_messaging_connections set is_candidate=false,candidate_version=null,version=version+1,state=case when is_selected then state else ${MESSAGING_CONNECTION_STATE.disconnected} end,state_reason=case when is_selected then state_reason else ${MESSAGING_CANDIDATE_MAINTENANCE.retirementReason} end,retired_at=case when is_selected then retired_at else (select retired_at from public.messaging_connection_versions where connection_id=${row.connection_id} and tribe_id=${row.tribe_id} and version=${row.candidate_version}) end,updated_at=clock_timestamp() where id=${row.connection_id} and tribe_id=${row.tribe_id} and version=${row.connection_version} and candidate_version=${row.candidate_version}`);
          result.expired += 1;
        }
        await this.assertAuthority(database);
        return result;
      });
    } catch (error) {
      if (error instanceof MessagingCandidateExpirationError) throw error;
      throw new MessagingCandidateExpirationError(MESSAGING_ERROR_CODE.operationUnresolved, { cause: error });
    }
  }
}
