/** @vitest-environment node */
/** Exercises actual abandoned-candidate maintenance, bounded concurrency and transaction failure semantics on owned SQL. @module messaging-candidate-expiration-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingCandidateExpiration } from "@/tests/support/messaging-candidate-expiration-fixture";
import { buildMessagingCandidateMaintenanceModule } from "@/src/modules/messaging/setup";
import { createRequestMessagingMaintenanceAuthorizer } from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native abandoned messaging candidate maintenance", () => {
  it("should retire due candidate versions and preserve selected resources, recent candidates, usage and original purge limits", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingCandidateExpiration(database), bearer = randomUUID();
      await database.applyMigration("20261012080000_claim_expired_messaging_candidates.sql");
      const before = await fixture.snapshot();
      const authorize = createRequestMessagingMaintenanceAuthorizer(new Request("https://example.test/api/maintenance/messaging", { headers: { authorization: `Bearer ${bearer}` } }), () => bearer);
      const maintenanceModule = buildMessagingCandidateMaintenanceModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize, readRecoveryLock: async () => false });
      expect(await maintenanceModule.useCases.expireCandidates.execute()).toEqual({ expired: 3, purgedImmediately: 1 });
      expect(await maintenanceModule.useCases.expireCandidates.execute()).toEqual({ expired: 0, purgedImmediately: 0 });
      const after = await fixture.snapshot();
      expect(after.usage).toEqual(before.usage); expect(after.events).toEqual(before.events);
      for (const resource of fixture.cases) {
        const connection = after.connections.find((row) => row.id === resource.connectionId)!;
        if (resource.name === "selected" || resource.name === "fresh") {
          expect(connection).toEqual(before.connections.find((row) => row.id === resource.connectionId));
          expect(after.resources.filter((row) => row.connection_id === resource.connectionId)).toEqual(before.resources.filter((row) => row.connection_id === resource.connectionId));
        } else {
          expect(connection).toMatchObject({ is_candidate: false, candidate_version: null, version: 2 });
          if (resource.name === "selected_with_candidate") {
            expect(connection).toMatchObject({ is_selected: true, selected_version: 1, state: "active", retired_at: null });
            expect(after.resources.find((row) => row.connection_id === resource.connectionId && row.version === 1)).toEqual(before.resources.find((row) => row.connection_id === resource.connectionId && row.version === 1));
          } else expect(connection).toMatchObject({ state: "disconnected", is_selected: false, retired_at: expect.any(String) });
          const version = after.resources.find((row) => row.connection_id === resource.connectionId && row.version === resource.candidateVersion)!;
          expect(version).toMatchObject({ retired_at: expect.any(String), purge_after: expect.any(String), reference_retained: true, purged: resource.name === "late", has_material: resource.name !== "late" });
          const limits = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ original_expiration: boolean; original_purge: boolean }>(sql`select retired_at=last_activity_at+interval '7 days' as original_expiration,purge_after=last_activity_at+interval '8 days' as original_purge from public.messaging_connection_versions where connection_id=${resource.connectionId} and version=${resource.candidateVersion}`)).rows[0]);
          expect(limits).toEqual({ original_expiration: true, original_purge: true });
        }
      }
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select * from public.claim_expired_messaging_candidates(1)`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should bound concurrent batches without retiring one candidate twice", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingCandidateExpiration(database);
      await database.applyMigration("20261012080000_claim_expired_messaging_candidates.sql");
      const maintenanceModule = buildMessagingCandidateMaintenanceModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize: async () => true, readRecoveryLock: async () => false });
      const results = await Promise.all([maintenanceModule.useCases.expireCandidates.execute({ limit: 2 }), maintenanceModule.useCases.expireCandidates.execute({ limit: 2 })]);
      expect(results.reduce((count, result) => count + result.expired, 0)).toBe(3);
      expect(results.every((result) => result.expired <= 2)).toBe(true);
      expect((await fixture.snapshot()).connections.filter((row) => row.version === 2)).toHaveLength(3);
    }, { concurrentTransactions: 2 });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should leave a future activity at the PostgreSQL timestamp limit unchanged without aborting other expired candidates", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingCandidateExpiration(database, { futureActivity: "294276-12-31 23:59:59+00" });
      await database.applyMigration("20261012080000_claim_expired_messaging_candidates.sql");
      const before = await fixture.snapshot();
      const maintenanceModule = buildMessagingCandidateMaintenanceModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize: async () => true, readRecoveryLock: async () => false });
      expect(await maintenanceModule.useCases.expireCandidates.execute()).toEqual({ expired: 3, purgedImmediately: 1 });
      const after = await fixture.snapshot(), future = fixture.cases.find((resource) => resource.name === "fresh")!;
      expect(after.connections.find((connection) => connection.id === future.connectionId)).toEqual(before.connections.find((connection) => connection.id === future.connectionId));
      expect(after.resources.filter((resource) => resource.connection_id === future.connectionId)).toEqual(before.resources.filter((resource) => resource.connection_id === future.connectionId));
      expect(after.usage).toEqual(before.usage); expect(after.events).toEqual(before.events);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
