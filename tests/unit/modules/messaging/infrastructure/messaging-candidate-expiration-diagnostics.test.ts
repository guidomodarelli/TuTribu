/** @vitest-environment node */
/** Exercises exact diagnostic-version retirement and preservation of completed/uncertain historical consumption on owned SQL. @module messaging-candidate-expiration-diagnostic-tests */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingCandidateExpiration } from "@/tests/support/messaging-candidate-expiration-fixture";
import { prepareCandidateDiagnosticHistory } from "@/tests/support/messaging-candidate-diagnostic-fixture";
import { buildMessagingCandidateMaintenanceModule } from "@/src/modules/messaging/setup";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { retireDiagnosticChallenges } from "@/src/modules/messaging/infrastructure/repositories/postgres-retired-diagnostic-challenges";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native expired-candidate diagnostic history", () => {
  it("should release only the expired version's diagnostic namespace and preserve selected history and accepted or unknown accounting", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingCandidateExpiration(database), resource = fixture.cases.find((entry) => entry.name === "selected_with_candidate")!;
      const diagnostic = await prepareCandidateDiagnosticHistory(database, fixture.userId, [{ resource, version: 1 }, { resource, version: 2 }]);
      await database.applyMigration("20261012080000_claim_expired_messaging_candidates.sql");
      const before = await diagnostic.snapshot(), usage = await fixture.snapshot();
      const maintenanceModule = buildMessagingCandidateMaintenanceModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize: async () => true, readRecoveryLock: async () => false });
      expect(await maintenanceModule.useCases.expireCandidates.execute()).toEqual({ expired: 3, purgedImmediately: 1 });
      const after = await diagnostic.snapshot();
      expect(after.attempts).toEqual(before.attempts); expect(after.reservations).toEqual(before.reservations); expect(after.events).toEqual(before.events);
      expect((await fixture.snapshot()).usage).toEqual(usage.usage);
      for (const history of diagnostic.histories) {
        const challenge = after.challenges.find((row) => row.id === history.challengeId)!, currentDiagnostic = after.diagnostics.find((row) => row.id === history.diagnosticId)!, delivery = after.deliveries.find((row) => row.id === history.deliveryId)!;
        if (history.connectionVersion === 1) {
          expect(challenge).toEqual(before.challenges.find((row) => row.id === history.challengeId));
          expect(currentDiagnostic).toEqual(before.diagnostics.find((row) => row.id === history.diagnosticId));
          expect(delivery).toEqual(before.deliveries.find((row) => row.id === history.deliveryId));
          expect(after.envelopes.some((row) => row.challenge_id === history.challengeId)).toBe(before.envelopes.some((row) => row.challenge_id === history.challengeId));
        } else {
          expect(challenge).toMatchObject({ is_current: false, version: 2, has_mac: false, has_envelope_reference: false, invalidation_reason: "candidate_expired", state: history.scenario === "verified" ? "verified" : "invalidated" });
          expect(currentDiagnostic).toMatchObject({ outcome: history.scenario === "verified" ? "verified" : "invalidated" });
          expect(currentDiagnostic.validated_at).toBe(before.diagnostics.find((row) => row.id === history.diagnosticId)!.validated_at);
          expect(after.envelopes.some((row) => row.challenge_id === history.challengeId)).toBe(false);
          if (history.scenario === "queued") expect(delivery).toMatchObject({ state: "cancelled", version: 2, last_outcome: "candidate_expired" });
          else expect(delivery).toEqual(before.deliveries.find((row) => row.id === history.deliveryId));
        }
      }
      expect(await maintenanceModule.useCases.expireCandidates.execute()).toEqual({ expired: 0, purgedImmediately: 0 });
      expect(await diagnostic.snapshot()).toEqual(after);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should preserve the existing connection replacement reason when the shared diagnostic owner receives no candidate expiration reason", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMessagingCandidateExpiration(database), resource = fixture.cases.find((entry) => entry.name === "selected_with_candidate")!;
      const diagnostic = await prepareCandidateDiagnosticHistory(database, fixture.userId, [{ resource, version: 2 }]);
      const before = await diagnostic.snapshot();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${resource.tribeId} for update`);
        await retireDiagnosticChallenges(transaction, { tribeId: resource.tribeId, connectionId: resource.connectionId, connectionVersion: 2 });
      });
      const after = await diagnostic.snapshot();
      expect(after.attempts).toEqual(before.attempts); expect(after.reservations).toEqual(before.reservations); expect(after.events).toEqual(before.events);
      for (const history of diagnostic.histories) {
        expect(after.challenges.find((row) => row.id === history.challengeId)).toMatchObject({ is_current: false, has_mac: false, has_envelope_reference: false, invalidation_reason: "connection_replaced" });
        const delivery = after.deliveries.find((row) => row.id === history.deliveryId);
        if (history.scenario === "queued") expect(delivery).toMatchObject({ state: "cancelled", last_outcome: "connection_replaced" });
        else expect(delivery).toEqual(before.deliveries.find((row) => row.id === history.deliveryId));
      }
      expect(after.envelopes).toHaveLength(0);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
