/** @vitest-environment node */
/** Exercises current recovery/authority withdrawal and an actual lost commit response during private candidate maintenance. @module messaging-candidate-expiration-recovery-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingCandidateExpiration } from "@/tests/support/messaging-candidate-expiration-fixture";
import { buildMessagingCandidateMaintenanceModule } from "@/src/modules/messaging/setup";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native candidate maintenance recovery", () => {
  it.each(["authority", "recovery"] as const)("should roll back original retirement when %s is withdrawn after a real mutation", async (gate) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingCandidateExpiration(database);
      await database.applyMigration("20261012080000_claim_expired_messaging_candidates.sql");
      const before = await fixture.snapshot();
      let observedRetirement = false;
      /** @param transaction - Actual current protected transaction. @returns Whether retirement is staged inside that same transaction. */
      const wasRetired = async (transaction?: RequestDatabase) => {
        if (!transaction) return false;
        const changed = Boolean((await transaction.execute(sql`select id from public.tenant_messaging_connections where contributed_by_user_id=${fixture.userId} and version=2 limit 1`)).rows[0]);
        observedRetirement ||= changed;
        return changed;
      };
      const maintenance = buildMessagingCandidateMaintenanceModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize: async (transaction) => gate !== "authority" || !await wasRetired(transaction), readRecoveryLock: async (transaction) => gate === "recovery" && await wasRetired(transaction) });
      await expect(maintenance.useCases.expireCandidates.execute({ limit: 1 })).rejects.toMatchObject({ code: gate === "authority" ? "permission_denied" : "connection_incomplete" });
      expect(observedRetirement).toBe(true);
      expect(await fixture.snapshot()).toEqual(before);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should preserve an indeterminate committed batch and reconcile without reviving bytes or repeating retired effects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingCandidateExpiration(database);
      await database.applyMigration("20261012080000_claim_expired_messaging_candidates.sql");
      const before = await fixture.snapshot();
      let loseResponse = true;
      const maintenance = buildMessagingCandidateMaintenanceModule({ execute: async (run) => { const result = await database.withContext({ userId: null, email: null }, run); if (loseResponse) { loseResponse = false; throw new Error("Controlled candidate maintenance COMMIT response loss"); } return result; }, authorize: async () => true, readRecoveryLock: async () => false });
      await expect(maintenance.useCases.expireCandidates.execute()).rejects.toMatchObject({ code: "operation_unresolved" });
      const committed = await fixture.snapshot();
      expect(committed.connections.filter((connection) => connection.version === 2)).toHaveLength(3);
      expect(committed.usage).toEqual(before.usage); expect(committed.events).toEqual(before.events);
      expect(await maintenance.useCases.expireCandidates.execute()).toEqual({ expired: 0, purgedImmediately: 0 });
      expect(await fixture.snapshot()).toEqual(committed);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should roll back when the live authority is withdrawn during the final awaited recovery read", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingCandidateExpiration(database);
      await database.applyMigration("20261012080000_claim_expired_messaging_candidates.sql");
      const before = await fixture.snapshot();
      let authorized = true, observedRetirement = false;
      const maintenance = buildMessagingCandidateMaintenanceModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize: async () => authorized, readRecoveryLock: async (transaction) => {
        if (transaction && (await transaction.execute(sql`select id from public.tenant_messaging_connections where contributed_by_user_id=${fixture.userId} and version=2 limit 1`)).rows[0]) { observedRetirement = true; authorized = false; }
        return false;
      } });
      await expect(maintenance.useCases.expireCandidates.execute({ limit: 1 })).rejects.toMatchObject({ code: "permission_denied" });
      expect(observedRetirement).toBe(true);
      expect(await fixture.snapshot()).toEqual(before);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
