/** Commits bounded own worker observations using live backend authority, without provider data. @module postgres-message-dispatch-run-recorder */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityFacts } from "../../domain/repositories/messaging-repositories";
import type { MessageDispatchPhaseSample, MessageDispatchRunRecorder, MessageDispatchRunStart, MessageDispatchTribeRun } from "../../domain/repositories/message-dispatch-observation";
import { MessagingDeliveryStorageError } from "../../domain/errors/messaging-delivery-storage-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGE_STORAGE_OPERATION } from "../../constants/message-delivery";
import { MESSAGE_DISPATCH_RUN_OUTCOME } from "../../constants/message-dispatch-observation";

/** Each call owns a short protected transaction; no SDK work occurs inside it. */
type ObservationExecutor = <Value>(actor: string | null, run: (database: RequestDatabase) => Promise<Value>) => Promise<Value>;
/** Server-only writer accepts scopes resolved by the original native claim/focal composition. */
export class PostgresMessageDispatchRunRecorder implements MessageDispatchRunRecorder {
  private readonly focalTribeId?: string;
  private readonly runtimeNow: () => number;
  /** @param execute - Existing owner worker executor. @param authorize - Live backend purpose or maintenance bearer. @param security - Non-secret hosting facts. @param options - `focalTribeId`: optional native exact scope. `runtimeNow`: host clock used to align the SQL sample with the existing run budget. */
  constructor(private readonly execute: ObservationExecutor, private readonly authorize: () => Promise<boolean>, private readonly security: () => Promise<MessagingSecurityFacts>, { focalTribeId, runtimeNow = Date.now }: { focalTribeId?: string; runtimeNow?: () => number } = {}) { this.focalTribeId = focalTribeId; this.runtimeNow = runtimeNow; }
  /** @param start - Optional original environment/epoch. @returns Current facts after checking backend purpose; no human actor is manufactured. */
  private async requireCurrent(start?: MessageDispatchRunStart): Promise<MessagingSecurityFacts> {
    if (!await this.authorize()) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.permissionDenied, { operation: MESSAGE_STORAGE_OPERATION.observe });
    const facts = await this.security();
    if (facts.recoveryLocked || start && (start.environment !== facts.environment || start.securityEpoch !== facts.securityEpoch)) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.connectionIncomplete, { operation: MESSAGE_STORAGE_OPERATION.observe });
    return facts;
  }
  /** @param database - Original transaction. @returns Fresh SQL time sampled after waits. */
  private async now(database: RequestDatabase): Promise<Date> { return new Date((await database.execute<{ at: string }>(sql`select clock_timestamp() as at`)).rows[0].at); }
  /** @param database - Original short transaction. @param start - Protected original start. @param run - Selected counters/scope. @param at - Actual owner clock. @param outcome - Closed operational completion. @returns Whether this is a newly persisted run, so a replay never moves its finish time. */
  private async writeRun(database: RequestDatabase, start: MessageDispatchRunStart, run: MessageDispatchTribeRun, { at, outcome }: { at: Date; outcome: "completed" | "incomplete" }): Promise<boolean> {
    if (this.focalTribeId && run.tribeId !== this.focalTribeId) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.permissionDenied, { operation: MESSAGE_STORAGE_OPERATION.observe });
    const counts = run.counters;
    const counters = { claimed: counts.claimed, authorized: counts.authorized, accepted: counts.accepted, delivered: counts.delivered, rejected: counts.rejected, unknown: counts.unknown, suppressed: counts.suppressed, quotaDeferred: counts.quotaDeferred, unresolved: counts.unresolved, deadlineReached: counts.deadlineReached };
    const inserted = await database.execute(sql`insert into public.messaging_dispatch_runs(run_id,tribe_id,started_at,finished_at,outcome,counters) values(${start.runId},${run.tribeId},${start.startedAt},${at},${outcome},${JSON.stringify(counters)}::jsonb) on conflict(run_id,tribe_id) do nothing returning run_id`);
    return inserted.rows.length > 0;
  }
  /** @param runId - Backend-generated identity. @returns Actual protected start, never an OAuth or provider timestamp. */
  async begin(runId: string): Promise<MessageDispatchRunStart> {
    const facts = await this.requireCurrent();
    try { return await this.execute(null, async (database) => { const startedAt = await this.now(database); const clockObservedAtMs = this.runtimeNow(); const start = { runId, startedAt, clockObservedAtMs, environment: facts.environment, securityEpoch: facts.securityEpoch }; await this.requireCurrent(start); return start; }); }
    catch (error) { if (error instanceof MessagingDeliveryStorageError) throw error; throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.operationUnresolved, { operation: MESSAGE_STORAGE_OPERATION.observe, cause: error }); }
  }
  /** @param start - Original SQL start. @param runs - Selected per-tribe facts. @param phases - Settled original calls. @param budgetMs - Server-owned observation bound. @returns After atomic selected records commit under current authority. */
  async finish(start: MessageDispatchRunStart, runs: readonly MessageDispatchTribeRun[], phases: readonly MessageDispatchPhaseSample[], budgetMs: number): Promise<void> {
    try {
      await this.execute(null, async (database) => {
        await this.requireCurrent(start);
        const finishedAt = await this.now(database);
        const insertedTribes: string[] = [];
        for (const run of runs) {
          const counts = run.counters;
          const outcome = run.outcome === MESSAGE_DISPATCH_RUN_OUTCOME.completed && counts.unresolved === 0 && !counts.deadlineReached && finishedAt.getTime() - start.startedAt.getTime() < budgetMs ? MESSAGE_DISPATCH_RUN_OUTCOME.completed : MESSAGE_DISPATCH_RUN_OUTCOME.incomplete;
          if (await this.writeRun(database, start, run, { at: finishedAt, outcome })) insertedTribes.push(run.tribeId);
        }
        await this.writePhases(database, start, phases);
        await this.requireCurrent(start);
        const observedAt = await this.now(database);
        if (insertedTribes.length) await database.execute(sql`update public.messaging_dispatch_runs set finished_at=greatest(finished_at,${observedAt}::timestamptz),outcome=case when ${observedAt}::timestamptz>=${start.startedAt}::timestamptz+${budgetMs}*interval '1 millisecond' then ${MESSAGE_DISPATCH_RUN_OUTCOME.incomplete} else outcome end where run_id=${start.runId} and tribe_id in (${sql.join(insertedTribes.map((tribeId) => sql`${tribeId}`), sql`, `)})`);
      });
    } catch (error) { if (error instanceof MessagingDeliveryStorageError) throw error; throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.operationUnresolved, { operation: MESSAGE_STORAGE_OPERATION.observe, cause: error }); }
  }
  /** @param database - Same original transaction. @param start - Original run. @param samples - Own bounded numeric facts. @returns After one atomic idempotent phase insert; an absent run fails instead of silently dropping evidence. */
  private async writePhases(database: RequestDatabase, start: MessageDispatchRunStart, samples: readonly MessageDispatchPhaseSample[]): Promise<void> {
    for (const sample of samples) {
      if (this.focalTribeId && sample.tribeId !== this.focalTribeId) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.permissionDenied, { operation: MESSAGE_STORAGE_OPERATION.observe });
    }
    if (!samples.length) return;
    const values = samples.map((sample) => sql`(${sample.sampleId},${start.runId},${sample.tribeId},${sample.phase},${sample.durationMs})`);
    await database.execute(sql`insert into public.messaging_dispatch_phase_samples(sample_id,run_id,tribe_id,phase,duration_ms) values ${sql.join(values, sql`, `)} on conflict(sample_id,tribe_id) do nothing`);
  }
  /** @param start - Original run. @param samples - Actually settled retained work. @returns After current-authority late observations commit without changing original run completion or causing another RPC. */
  async appendPhases(start: MessageDispatchRunStart, samples: readonly MessageDispatchPhaseSample[], lateScopes: readonly MessageDispatchTribeRun[] = []): Promise<void> {
    if (!samples.length) return;
    try { await this.execute(null, async (database) => { await this.requireCurrent(start); const observedAt = await this.now(database); for (const run of lateScopes) await this.writeRun(database, start, run, { at: observedAt, outcome: MESSAGE_DISPATCH_RUN_OUTCOME.incomplete }); await this.writePhases(database, start, samples); await this.requireCurrent(start); }); }
    catch (error) { if (error instanceof MessagingDeliveryStorageError) throw error; throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.operationUnresolved, { operation: MESSAGE_STORAGE_OPERATION.observe, cause: error }); }
  }
}
