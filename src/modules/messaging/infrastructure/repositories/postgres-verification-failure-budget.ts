/**
 * Keeps local code-failure consumption independent of tribe, connection, channel and send quota.
 * @module postgres-verification-failure-budget
 */
import "server-only";
import { sql } from "drizzle-orm";
import { VERIFICATION_FAILURE_REPLAY_STATE } from "@/src/modules/academy-admissions/constants/verification-challenge";
import { MESSAGING_USAGE_LIMIT } from "@/src/modules/messaging/constants/messaging-limits";
import { VERIFICATION_FAILURE_EVENT_TYPE, VERIFICATION_FAILURE_HOURLY_WINDOW_MS, VERIFICATION_FAILURE_LOCK_DOMAIN } from "@/src/modules/messaging/constants/verification-failure-budget";
import type { VerificationFailureBudget, VerificationFailureIdentity } from "@/src/modules/academy-admissions/domain/repositories/verification-failure-budget";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Requires prior current-context authorization and keeps its lock until the caller commits or rolls back. */
export class PostgresVerificationFailureBudget implements VerificationFailureBudget {
  /** @param database - The caller's existing guarded, authorized transaction; no new checkout is acquired. */
  constructor(private readonly database: RequestDatabase) {}

  /**
   * Serializes validations across all tribes without locking or exposing another account's counters.
   * @param userId - Current authorized application actor.
   * @returns Nothing after retaining the account-wide transaction lock.
   */
  async lockAccount(userId: string): Promise<void> {
    await this.database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([VERIFICATION_FAILURE_LOCK_DOMAIN, userId])},0))`);
  }

  /**
   * Recovers a confirmed failure before applying current limits or incrementing another challenge.
   * @param identity - Exact current account, tribe, purpose, channel and original validation identity.
   * @returns Confirmed replay, conflicting reuse, or absence without returning private event data.
   */
  async readRecordedFailure(identity: VerificationFailureIdentity): Promise<"absent" | "recorded" | "conflict"> {
    const row = (await this.database.execute<{ actor_user_id: string | null; tribe_id: string; challenge_id: string; purpose: string; channel: string }>(sql`select actor_user_id,tribe_id,challenge_id,purpose,channel from public.messaging_usage_events where event_type=${VERIFICATION_FAILURE_EVENT_TYPE} and operation_id=${identity.operationId}`)).rows[0];
    if (!row) return VERIFICATION_FAILURE_REPLAY_STATE.absent;
    return row.actor_user_id === identity.userId && row.tribe_id === identity.tribeId && row.challenge_id === identity.challengeId && row.purpose === identity.purpose && row.channel === identity.channel ? VERIFICATION_FAILURE_REPLAY_STATE.recorded : VERIFICATION_FAILURE_REPLAY_STATE.conflict;
  }

  /**
   * Reads the moving hour and UTC calendar day under the account lock, after any preceding wait.
   * @param userId - Current actor; the aggregate never reveals its contributing tribes.
   * @param now - Authoritative database clock sampled after locks and local crypto.
   * @returns Whether another local verification is permitted by both failure ceilings.
   */
  async hasCapacity(userId: string, now: Date): Promise<boolean> {
    const counts = (await this.database.execute<{ hourly: number; daily: number }>(sql`
      select count(*) filter(where occurred_at>${new Date(now.getTime() - VERIFICATION_FAILURE_HOURLY_WINDOW_MS)})::integer as hourly,
        count(*) filter(where occurred_at>=date_trunc('day',${now}::timestamptz at time zone 'UTC') at time zone 'UTC')::integer as daily
      from public.messaging_usage_events where actor_user_id=${userId} and event_type=${VERIFICATION_FAILURE_EVENT_TYPE}
        and occurred_at<=${now} and occurred_at>=least(${new Date(now.getTime() - VERIFICATION_FAILURE_HOURLY_WINDOW_MS)}::timestamptz,date_trunc('day',${now}::timestamptz at time zone 'UTC') at time zone 'UTC')
    `)).rows[0];
    return counts.hourly < MESSAGING_USAGE_LIMIT.accountFailuresHourly && counts.daily < MESSAGING_USAGE_LIMIT.accountFailuresDaily;
  }

  /**
   * Records one failure in the same transaction as its challenge transition.
   * @param identity - Previously authorized and locked original attempt; the operation ledger fixes its intent.
   * @param now - Final authoritative clock used by the challenge transition.
   * @returns Whether a new event was inserted; conflicting or replayed events never consume again.
   */
  async recordFailure(identity: VerificationFailureIdentity, now: Date): Promise<boolean> {
    const inserted = await this.database.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,challenge_id,purpose,channel,event_type,operation_id,occurred_at) values (${identity.tribeId},${identity.userId},${identity.challengeId},${identity.purpose},${identity.channel},${VERIFICATION_FAILURE_EVENT_TYPE},${identity.operationId},${now}) on conflict(event_type,operation_id) do nothing returning id`);
    return inserted.rows.length === 1;
  }
}
