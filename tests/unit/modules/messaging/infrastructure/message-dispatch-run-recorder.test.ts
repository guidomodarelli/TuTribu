/** @vitest-environment node */
/** Exercises native worker observation commits, rollback and owner-only RLS without a database mock. @module message-dispatch-run-recorder-tests */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresMessageDispatchRunRecorder } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-dispatch-run-recorder";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { MESSAGE_DISPATCH_OBSERVATION_PHASE } from "@/src/modules/messaging/constants/message-dispatch-observation";

/** @param tribeId - Native fixture scope. @returns Selected own counts, independent of credentials or provider content. */
function run(tribeId: string) { return { tribeId, outcome: "completed" as const, counters: { claimed: 1, authorized: 1, accepted: 1, delivered: 0, rejected: 0, unknown: 0, suppressed: 0, quotaDeferred: 0, unresolved: 0, deadlineReached: false } }; }

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native dispatch run observations", () => {
  it("should preserve selected original facts, idempotent late phases and owner-only reads/writes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database), tribeId = fixture.scope.tribeId;
      const recorder = new PostgresMessageDispatchRunRecorder((actor, work) => database.withContext({ userId: actor, email: null }, work), async () => true, async () => fixture.config, tribeId);
      const start = await recorder.begin(randomUUID()), sample = { sampleId: randomUUID(), tribeId, phase: "send" as const, durationMs: 27 };
      const preparationSample = { ...sample, sampleId: randomUUID(), phase: MESSAGE_DISPATCH_OBSERVATION_PHASE.prepare, durationMs: sample.durationMs + 1 };
      const samples = [sample, preparationSample, sample];
      await recorder.finish(start, [run(tribeId)], samples, 45_000); await recorder.appendPhases(start, samples);
      await database.withContext(fixture.own, async (transaction) => {
        const rows = (await transaction.execute(sql`select run_id,tribe_id,outcome,counters from public.messaging_dispatch_runs`)).rows;
        expect(rows).toEqual([{ run_id: start.runId, tribe_id: tribeId, outcome: "completed", counters: run(tribeId).counters }]);
        const phases = (await transaction.execute(sql`select sample_id,phase,duration_ms::text from public.messaging_dispatch_phase_samples`)).rows;
        expect(phases).toHaveLength(2);
        expect(phases).toEqual(expect.arrayContaining([{ sample_id: sample.sampleId, phase: sample.phase, duration_ms: String(sample.durationMs) }, { sample_id: preparationSample.sampleId, phase: preparationSample.phase, duration_ms: String(preparationSample.durationMs) }]));
      });
      const first = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select finished_at,outcome from public.messaging_dispatch_runs where run_id=${start.runId}`)).rows);
      await recorder.finish(start, [run(tribeId)], samples, 45_000);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select finished_at,outcome from public.messaging_dispatch_runs where run_id=${start.runId}`)).rows)).toEqual(first);
      await database.grantTablesToNonBypass(["messaging_dispatch_runs", "messaging_dispatch_phase_samples"]);
      expect(await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select run_id from public.messaging_dispatch_runs`), "non_bypass")).toMatchObject({ rows: [] });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.messaging_dispatch_runs(run_id,tribe_id,started_at,finished_at,outcome,counters) values(gen_random_uuid(),${tribeId},clock_timestamp(),clock_timestamp(),'completed','{}')`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, 600_000);
  it("should sample completion after the last authorized wait and never certify a finish beyond the SQL budget", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database), tribeId = fixture.scope.tribeId;
      let checks = 0, elapsedBeforeWait = Number.POSITIVE_INFINITY;
      let activeTransaction: RequestDatabase | undefined;
      const recorder = new PostgresMessageDispatchRunRecorder((actor, work) => database.withContext({ userId: actor, email: null }, async (transaction) => { activeTransaction = transaction; try { return await work(transaction); } finally { activeTransaction = undefined; } }), async () => true, async () => {
        if (++checks === 4) {
          if (!activeTransaction) throw new Error("Expected original observation transaction before final authority wait");
          const clock = new Date((await activeTransaction.execute<{ at: string }>(sql`select clock_timestamp() as at`)).rows[0].at);
          elapsedBeforeWait = clock.getTime() - startAt.getTime();
          await delay(3_200);
        }
        return fixture.config;
      }, tribeId);
      const start = await recorder.begin(randomUUID()), startAt = start.startedAt;
      await recorder.finish(start, [run(tribeId)], [], 3_000);
      expect(elapsedBeforeWait).toBeLessThan(3_000);
      const rows = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ outcome: string; elapsed_ms: string }>(sql`select outcome,extract(epoch from finished_at-started_at)*1000 as elapsed_ms from public.messaging_dispatch_runs where run_id=${start.runId}`)).rows);
      expect(rows[0].outcome).toBe("incomplete"); expect(Number(rows[0].elapsed_ms)).toBeGreaterThanOrEqual(3_000);
    });
  }, 600_000);
  it("should roll back the whole observation on a foreign phase and when recovery activates after writes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database), tribeId = fixture.scope.tribeId;
      let checks = 0, lockAt = Number.POSITIVE_INFINITY;
      const recorder = new PostgresMessageDispatchRunRecorder((actor, work) => database.withContext({ userId: actor, email: null }, work), async () => true, async () => ({ ...fixture.config, recoveryLocked: ++checks >= lockAt }), tribeId);
      const start = await recorder.begin(randomUUID());
      await expect(recorder.finish(start, [run(tribeId)], [{ sampleId: randomUUID(), tribeId: randomUUID(), phase: "send", durationMs: 9 }], 45_000)).rejects.toMatchObject({ code: "permission_denied" });
      const valid = { sampleId: randomUUID(), tribeId, phase: MESSAGE_DISPATCH_OBSERVATION_PHASE.send, durationMs: 9 };
      await expect(recorder.finish(start, [run(tribeId)], [valid, { ...valid, sampleId: randomUUID(), durationMs: -1 }], 45_000)).rejects.toMatchObject({ code: "operation_unresolved", cause: { cause: { code: "23514" } } });
      lockAt = checks + 2;
      await expect(recorder.finish(start, [run(tribeId)], [{ sampleId: randomUUID(), tribeId, phase: "send", durationMs: 9 }], 45_000)).rejects.toMatchObject({ code: "connection_incomplete" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as count from public.messaging_dispatch_runs`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::integer as count from public.messaging_dispatch_phase_samples`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 600_000);
});
