/** @vitest-environment node */
/** Exercises skip-before-limit selection using a real held tribe lock and an independent available expired candidate. @module messaging-candidate-expiration-lock-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingCandidateExpiration } from "@/tests/support/messaging-candidate-expiration-fixture";
import { buildMessagingCandidateMaintenanceModule } from "@/src/modules/messaging/setup";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native candidate expiration lock order", () => {
  it("should skip a held eligible tribe before applying the batch limit and retire the next available original", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingCandidateExpiration(database);
      await database.applyMigration("20261012080000_claim_expired_messaging_candidates.sql");
      const eligible = fixture.cases.filter((candidate) => candidate.name === "expired" || candidate.name === "late" || candidate.name === "selected_with_candidate").sort((first, second) => first.tribeId.localeCompare(second.tribeId));
      const held = eligible[0], locked = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      const blocker = database.withContext(fixture.own, async (transaction) => { await transaction.execute(sql`select id from public.tribes where id=${held.tribeId} for update`); locked.resolve(); await release.promise; });
      void blocker.catch((error: unknown) => locked.reject(error));
      try {
        await locked.promise;
        const maintenance = buildMessagingCandidateMaintenanceModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize: async () => true, readRecoveryLock: async () => false });
        const result = await maintenance.useCases.expireCandidates.execute({ limit: 1 });
        expect(result.expired).toBe(1);
        const after = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ id: string; version: number }>(sql`select id,version from public.tenant_messaging_connections where contributed_by_user_id=${fixture.userId}`)).rows);
        expect(after.find((connection) => connection.id === held.connectionId)?.version).toBe(1);
        expect(after.filter((connection) => connection.version === 2)).toHaveLength(1);
      } finally { release.resolve(); await blocker; }
    }, { concurrentTransactions: 2 });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
