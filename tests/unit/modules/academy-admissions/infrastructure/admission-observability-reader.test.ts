/** @vitest-environment node */
/** Exercises actual scoped projections, ledger decisions, read audit, microsecond paging and native role guards. @module admission-observability-reader-tests */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { TRIBE_LIFECYCLE_AUDIT_MIGRATIONS } from "@/tests/support/constants/tribe-lifecycle-audit";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresAdmissionActivityReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activity-reader";
import { admissionActivityQuerySchema } from "@/src/modules/academy-admissions/constants/admission-activity-schemas";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { PostgresMessageDispatchRunRecorder } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-dispatch-run-recorder";

/** @param database - Exact owned branch. @param withGuardian - Seeds a legitimate guardian before the protected admission cutover. @returns Real leader/applicant command composition and current observability queries without any provider/hosting-key lookup. */
async function prepareObservability(database: AcademyAdmissionTestDatabase, withGuardian = false) {
  const prepared = withGuardian ? await prepareAllowlistAdmission(database, undefined, "active", "guardian") : await prepareAllowlistAdmission(database);
  for (const migration of TRIBE_LIFECYCLE_AUDIT_MIGRATIONS) await database.applyMigration(migration);
  await database.applyMigration("20261014134826_read_admission_activity_and_metrics.sql");
  await database.applyMigration("20261014173100_read_dispatch_run_metrics.sql");
  await database.applyMigration("20261014185500_integrate_admission_notification_audit.sql");
  const { fixture } = prepared;
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
  const observations = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createActivityQueryModule().useCases;
  return { ...prepared, observations, query: { tribeId: fixture.tribeId, requestId: randomUUID() }, scope: { tribeId: fixture.tribeId, userId: fixture.userId, sessionId: fixture.sessionId, requestId: randomUUID() } };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission observability", () => {
  it("should include real completed dispatch and exact per-phase samples while excluding a later incomplete run", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, observations, query } = await prepareObservability(database), tribeId = fixture.tribeId;
      const recorder = new PostgresMessageDispatchRunRecorder((actor, work) => database.withContext({ userId: actor, email: null }, work), async () => true, async () => fixture.config, tribeId);
      const counters = { claimed: 1, authorized: 1, accepted: 1, delivered: 0, rejected: 0, unknown: 0, suppressed: 0, quotaDeferred: 0, unresolved: 0, deadlineReached: false }, start = await recorder.begin(randomUUID());
      const phases = [13, 27].map((durationMs) => ({ sampleId: randomUUID(), tribeId, phase: "send" as const, durationMs }));
      await recorder.finish(start, [{ tribeId, outcome: "completed", counters }], phases, 45_000);
      await recorder.appendPhases(start, phases);
      const completed = await observations.metrics(query);
      expect(completed).toMatchObject({ ok: true, value: { lastSuccessfulRun: { operation: "messaging_dispatch" }, durations: [{ phase: "send", sampleCount: 2, p95Ms: 27 }], deliveries: { accepted: 0, delivered: 0 } } });
      const incomplete = await recorder.begin(randomUUID());
      await recorder.finish(incomplete, [{ tribeId, outcome: "incomplete", counters: { ...counters, accepted: 0, unknown: 1, unresolved: 1 } }], [], 45_000);
      const after = await observations.metrics(query);
      if (!completed.ok || !after.ok) throw new Error("Native worker metrics failed: own_result_unavailable");
      expect(after.value.lastSuccessfulRun).toEqual(completed.value.lastSuccessfulRun);
      expect(after.value.durations).toEqual(completed.value.durations);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
  it("should keep empty history, missing usage and absent worker success explicit while recording each authorized read without a ledger or version change", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, observations, query } = await prepareObservability(database);
      const policyBefore = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,verification_epoch from public.academy_admission_policies where tribe_id=${fixture.tribeId}`)).rows);
      for (const _read of [false, true]) expect(await observations.metrics(query)).toMatchObject({ ok: true, value: { tribeId: fixture.tribeId, requests: { pending: 0, approved: 0, oldestPendingAgeMs: null }, attempts: { inFlight: 0, accepted: 0, delivered: 0, rejected: 0, unknown: 0 }, deliveries: { queued: 0, oldestQueuedAgeMs: null }, usage: { policyVersion: null, verificationToday: 0, notificationToday: 0 }, verification: [], lastSuccessfulRun: null, durations: [], errors: [] } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select version,verification_epoch from public.academy_admission_policies where tribe_id=${fixture.tribeId}`)).rows).toEqual(policyBefore);
        expect((await transaction.execute(sql`select count(*)::integer as count from public.academy_admission_operations where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
        const access = (await transaction.execute(sql`select actor_user_id,operation_id,resource_version,metadata from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and event_type='authorized_resource_exposure'`)).rows;
        expect(access).toHaveLength(2);
        expect(access.every((row) => row.actor_user_id === fixture.userId && row.operation_id === null && row.resource_version === null)).toBe(true);
        expect(access.map((row) => row.metadata)).toEqual([{ surface: "metrics", itemCount: 1, resourceKind: "aggregate" }, { surface: "metrics", itemCount: 1, resourceKind: "aggregate" }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should count real automatic and manual decisions once and retain terminal history after account-owned rows disappear", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, observations, query, applicant: createApplicant, leader } = await prepareObservability(database);
      const automatic = await createApplicant();
      await fixture.writer.create({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry), operationId: randomUUID(), confirmed: true, contact: { type: "email", value: automatic.email }, displayName: null });
      const automaticInput = automatic.input;
      expect(await automatic.commands.submit.execute(automaticInput)).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted" } } });
      expect(await automatic.commands.submit.execute(automaticInput)).toMatchObject({ ok: true, value: { replayed: true } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const manual = await createApplicant(), pending = await createApplicant();
      for (const applicant of [manual, pending]) expect(await applicant.commands.submit.execute({ ...applicant.input, expectedPolicyVersion: 3 })).toMatchObject({ ok: true, value: { result: { outcome: "pending" } } });
      const request = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string; version: number }>(sql`select id,version from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${manual.userId}`)).rows[0]);
      const decision = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: request.id, expectedVersion: request.version, confirmed: true as const, decision: "approve" as const, internalReason: "Synthetic private reviewer note", externalMessage: null };
      expect(await leader.decide.execute(decision)).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved" } } });
      expect(await leader.decide.execute(decision)).toMatchObject({ ok: true, value: { replayed: true } });
      const result = await observations.metrics(query);
      expect(result).toMatchObject({ ok: true, value: { requests: { pending: 1, approved: 2 }, reviews: { automatic: 1, manual: 1 } } });
      if (!result.ok) throw new Error("Native metrics fixture failed: scoped_result_unavailable");
      expect(result.value.requests.oldestPendingAgeMs).toBeGreaterThanOrEqual(0);
      expect(result.value.durations.some((sample) => sample.phase === "admission" && sample.sampleCount === 3)).toBe(true);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public."user" where id=${automatic.userId}`));
      expect(await observations.metrics(query)).toMatchObject({ ok: true, value: { requests: { pending: 1, approved: 2 }, reviews: { automatic: 1, manual: 1 } } });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should paginate equal-millisecond history with exact SQL microseconds and suppress free notes, contact and ciphertext", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, observations, query } = await prepareObservability(database), resourceId = randomUUID(), ids = [randomUUID(), randomUUID(), randomUUID()];
      await database.withContext(fixture.own, async (transaction) => {
        const instant = (await transaction.execute<{ at: string }>(sql`select date_trunc('milliseconds',clock_timestamp()) as at`)).rows[0].at;
        for (const [index, id] of ids.entries()) await transaction.execute(sql`insert into public.academy_admission_audit_events(id,tribe_id,actor_user_id,resource_type,resource_id,event_type,rule,cause,metadata,created_at) values (${id},${fixture.tribeId},${fixture.userId},'admission_request',${resourceId},'proof_attached',${'Synthetic private note'}::text,${'Synthetic private cause'}::text,${JSON.stringify({ proofId: randomUUID(), previousVersion: 1, contact: fixture.own.email, verificationCode: "synthetic-otp", ciphertext: "synthetic-encrypted-body" })}::jsonb,${instant}::timestamptz+${index}*interval '1 microsecond')`);
      });
      const seen: string[] = [];
      let cursor: string | undefined;
      for (const _page of ids) {
        const filters = admissionActivityQuerySchema.parse({ limit: "1", resourceId, ...(cursor ? { cursor } : {}) });
        const page = await observations.activity({ ...query, ...filters });
        if (!page.ok) throw new Error("Native activity paging fixture failed: own_page_unavailable");
        expect(page.value.items).toHaveLength(1);
        const item = page.value.items[0];
        expect(item.rule).toBeNull(); expect(item.cause).toBeNull();
        expect(Object.keys(item.changes).sort()).toEqual(["previousVersion", "proofId"]);
        const serialized = JSON.stringify(page.value);
        for (const marker of [fixture.own.email, "synthetic-otp", "synthetic-encrypted-body", "Synthetic private note", "Synthetic private cause"]) expect(serialized).not.toContain(marker);
        seen.push(item.id); cursor = page.value.nextCursor ?? undefined;
      }
      expect(new Set(seen).size).toBe(3); expect(seen.sort()).toEqual(ids.sort()); expect(cursor).toBeUndefined();
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should close raw and application projections to guardians, nonmembers, foreign scope and expired native sessions without exposing data", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, observations, query, scope, historicalApplicant: guardian, applicant: createApplicant } = await prepareObservability(database, true), nonmember = await createApplicant();
      if (!guardian) throw new Error("Native guardian fixture failed: pre_cutover_membership_unavailable");
      for (const actor of [{ userId: guardian.userId, sessionId: guardian.sessionId }, { userId: nonmember.userId, sessionId: nonmember.sessionId }, { userId: fixture.userId, sessionId: fixture.sessionId }]) {
        const reader = new PostgresAdmissionActivityReader((current, run) => database.withContext({ userId: current.userId, email: null }, run));
        if (actor.userId !== fixture.userId) await expect(reader.readMetrics({ ...scope, ...actor })).rejects.toMatchObject({ code: "permission_denied" });
        else await expect(reader.readMetrics({ ...scope, tribeId: randomUUID() })).rejects.toMatchObject({ code: "authentication_required" });
      }
      await database.grantTablesToNonBypass(["user", "session", "account", "tribes", "tribe_members", "global_session_identity_bindings", "global_identity_evidence", "academy_admission_audit_events"]);
      await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute<{ result: { tribeId: string } }>(sql`select public.read_academy_admission_metrics(${fixture.tribeId},${fixture.sessionId}) as result`)).rows[0].result.tribeId).toBe(fixture.tribeId); }, "non_bypass");
      await database.withServerEnvironment(async (environment) => {
        const client = new Client({ connectionString: environment.DATABASE_URL });
        try {
          await client.connect(); await client.query("begin");
          await client.query(`set local role "${database.nonBypassRole.name}"`);
          await client.query("select set_config('app.current_user_id',$1,true)", [fixture.userId]);
          await expect(client.query("insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,event_type) values($1,$2,'authorized_exposure','authorized_resource_exposure')", [fixture.tribeId, fixture.userId])).rejects.toMatchObject({ code: "42501" });
          await client.query("rollback");
        } finally { await client.end(); }
      });
      const protectedReader = new PostgresAdmissionActivityReader((current, run) => database.withContext({ userId: current.userId, email: null }, run, "non_bypass"));
      expect(await protectedReader.readMetrics(scope)).toMatchObject({ tribeId: fixture.tribeId, requests: { pending: 0 } });
      expect(await protectedReader.readActivity(scope, { limit: 1, resourceType: "authorized_exposure" })).toMatchObject({ tribeId: fixture.tribeId, items: [{ eventType: "authorized_resource_exposure" }] });
      await database.withContext(fixture.own, async (transaction) => {
        for (const [surface, count] of [["metrics", 0], ["activity", 51], ["unapproved_surface", 1]] as const) expect((await transaction.execute(sql`select public.record_academy_admission_authorized_exposure(${fixture.tribeId},${fixture.sessionId},${surface},${count}) as recorded`)).rows).toEqual([{ recorded: false }]);
      }, "non_bypass");
      await database.withContext({ userId: guardian.userId, email: null }, async (transaction) => { expect((await transaction.execute(sql`select public.read_academy_admission_metrics(${fixture.tribeId},${guardian.sessionId}) as result`)).rows).toEqual([{ result: null }]); }, "non_bypass");
      await database.withContext({ userId: guardian.userId, email: null }, async (transaction) => { expect((await transaction.execute(sql`select public.record_academy_admission_authorized_exposure(${fixture.tribeId},${guardian.sessionId},'metrics',1) as recorded`)).rows).toEqual([{ recorded: false }]); }, "non_bypass");
      const accessBefore = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::integer as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='authorized_exposure'`)).rows[0].count);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.sessionId}`));
      expect(await observations.metrics(query)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
      await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select public.record_academy_admission_authorized_exposure(${fixture.tribeId},${fixture.sessionId},'metrics',1) as recorded`)).rows).toEqual([{ recorded: false }]); }, "non_bypass");
      await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select count(*)::integer as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='authorized_exposure'`)).rows).toEqual([{ count: accessBefore }]); });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
