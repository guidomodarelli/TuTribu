/** @vitest-environment node */
/** Proves actual markers/receipts/UTC consumption and committed worker observations without provider requests. @module admission-observability-usage-worker-tests */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer } from "@/tests/support/contact-verification-issuance-fixture";
import { prepareTribeMembershipLifecycle } from "@/tests/support/tribe-membership-lifecycle-fixture";
import { TRIBE_LIFECYCLE_AUDIT_MIGRATIONS, TRIBE_RETIREMENT_PROVENANCE_MIGRATIONS } from "@/tests/support/constants/tribe-lifecycle-audit";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { PostgresAdmissionActivityReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activity-reader";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { buildAdmissionExpirationModule } from "@/src/modules/academy-admissions/setup";
import { academyAdmissionWorkerRuns } from "@/src/modules/shared/infrastructure/database/schema";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native usage and worker observations", () => {
  it("should count actual attempts and UTC reservations without resetting usage after policy edits or repeated unknown receipts", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database);
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261006220000_extend_admission_notifications.sql", "20261007005000_read_admission_reviews.sql", "20261005092500_guard_messaging_attempts.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261014035258_audit_messaging_delivery_transitions.sql", ...TRIBE_LIFECYCLE_AUDIT_MIGRATIONS, "20261014134826_read_admission_activity_and_metrics.sql"]) await database.applyMigration(migration);
      const sessionId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`));
      const scope = { tribeId: fixture.scope.tribeId, userId: fixture.userId, sessionId, requestId: randomUUID() };
      const reader = new PostgresAdmissionActivityReader((current, run) => database.withContext({ userId: current.userId, email: null }, run));
      const issued = await fixture.issue();
      if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Usage metrics fixture failed: challenge_unavailable");
      expect(await reader.readMetrics(scope)).toMatchObject({ verification: [{ channel: "email", issued: 1, verified: 0, failedAttempts: 0 }], deliveries: { queued: 1 }, attempts: { inFlight: 0 }, usage: { policyVersion: 1, verificationToday: 0, notificationToday: 0 } });
      const repository = new PostgresMessageDeliveryRepository((actor, run) => database.withContext({ userId: actor, email: null }, run), async () => true, async () => fixture.config);
      const claim = (await repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      const authorization = await repository.authorize(claim, randomUUID());
      if (authorization.outcome !== "authorized") throw new Error("Usage metrics fixture failed: charged_marker_unavailable");
      expect(await reader.readMetrics(scope)).toMatchObject({ deliveries: { queued: 1, inFlightLeases: 1 }, attempts: { inFlight: 1 }, usage: { verificationToday: 1 } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,version=version+1 where tribe_id=${scope.tribeId}`));
      const receipt = { context: authorization.context, outcome: "unknown" as const, providerMessageId: null, correlationId: null, reason: "dispatch_result_unknown" as const };
      expect(await repository.complete(receipt)).toMatchObject({ outcome: "completed" });
      expect(await repository.complete(receipt)).toMatchObject({ outcome: "unchanged" });
      const metrics = await reader.readMetrics(scope);
      expect(metrics).toMatchObject({ deliveries: { queued: 0, unknown: 1, inFlightLeases: 0, oldestQueuedAgeMs: null }, attempts: { inFlight: 0, unknown: 1 }, usage: { policyVersion: 2, verificationToday: 1 }, errors: [{ code: "delivery_unknown", count: 1 }], lastSuccessfulRun: null });
      expect(new Date(metrics.usage.dayStartUtc).getUTCHours()).toBe(0);
      expect(metrics.durations.some((sample) => sample.phase === "dispatch" && sample.sampleCount === 1)).toBe(true);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as count from public.messaging_usage_reservations where tribe_id=${scope.tribeId} and state='consumed'`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select version from public.messaging_usage_policies where tribe_id=${scope.tribeId}`)).rows).toEqual([{ version: 2 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should publish a successful expiration run only after its real atomic effects and preserve it on an empty catch-up", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareTribeMembershipLifecycle(database, false, 31);
      await database.applyMigration("20261005100000_guard_messaging_secret_retirement.sql");
      await database.applyMigration("20261007005000_read_admission_reviews.sql");
      for (const migration of TRIBE_RETIREMENT_PROVENANCE_MIGRATIONS) await database.applyMigration(migration);
      await database.applyMigration("20261014134826_read_admission_activity_and_metrics.sql");
      await database.applyMigration("20261014153700_audit_admission_administrative_reads.sql");
      const own = { userId: fixture.leader.userId, email: fixture.leader.email };
      const scope = { tribeId: fixture.tribeId, userId: fixture.leader.userId, sessionId: fixture.leader.sessionId, requestId: randomUUID() };
      const reader = new PostgresAdmissionActivityReader((_scope, run) => database.withContext(own, run));
      const expiration = buildAdmissionExpirationModule({ execute: (run) => database.withContext(own, run), authorize: async () => true });
      expect((await reader.readMetrics(scope)).lastSuccessfulRun).toBeNull();
      let authorityReads = 0;
      const interrupted = buildAdmissionExpirationModule({ execute: (run) => database.withContext(own, run), authorize: async () => { authorityReads += 1; return authorityReads === 1; } });
      await expect(interrupted.useCases.expireRequests.execute({ limit: 1 })).rejects.toMatchObject({ code: "permission_denied" });
      expect(await reader.readMetrics(scope)).toMatchObject({ requests: { pending: 2, expired: 0 }, lastSuccessfulRun: null, maintenance: null, durations: [] });
      await database.withContext(own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as count from public.academy_admission_worker_runs where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::integer as count from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and outcome='expired'`)).rows).toEqual([{ count: 0 }]);
      });
      expect(await expiration.useCases.expireRequests.execute({ limit: 1 })).toEqual({ expired: 1 });
      const after = await reader.readMetrics(scope);
      expect(after).toMatchObject({ requests: { pending: 1, expired: 1 }, lastSuccessfulRun: { operation: "admission_expiration" } });
      expect(after.durations).toContainEqual({ phase: "retention", sampleCount: 1, p95Ms: expect.any(Number) });
      expect(await expiration.useCases.expireRequests.execute({ limit: 1 })).toEqual({ expired: 0 });
      expect((await reader.readMetrics(scope)).lastSuccessfulRun).toEqual(after.lastSuccessfulRun);
      await database.withContext(own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as count,sum(processed)::integer as processed from public.academy_admission_worker_runs where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 1, processed: 1 }]);
        const runs = await transaction.select().from(academyAdmissionWorkerRuns).where(eq(academyAdmissionWorkerRuns.tribeId, fixture.tribeId));
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({ tribeId: fixture.tribeId, operation: "admission_expiration", processed: 1 });
        expect(runs[0].finishedAt.toISOString()).toBe(after.lastSuccessfulRun?.at);
      });
      await database.grantTablesToNonBypass(["academy_admission_worker_runs"]);
      await database.withContext(own, async (transaction) => { expect(await transaction.select().from(academyAdmissionWorkerRuns)).toEqual([]); }, "non_bypass");
      await expect(database.withContext(own, (transaction) => transaction.execute(sql`insert into public.academy_admission_worker_runs(run_id,tribe_id,operation,started_at,finished_at,processed) values(gen_random_uuid(),${fixture.tribeId},'admission_expiration',clock_timestamp(),clock_timestamp(),1)`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
