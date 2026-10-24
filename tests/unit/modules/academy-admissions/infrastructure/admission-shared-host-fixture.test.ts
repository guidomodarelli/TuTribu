/** @vitest-environment node */
/** Exercises real application commands with independently imported external host configuration. */
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionPerformanceFixture } from "@/tests/support/admission-performance-fixture";
import { createAdmissionSyntheticHostingEnvironment } from "@/tests/support/admission-synthetic-hosting-environment";
import { ADMISSION_PERFORMANCE, ADMISSION_SHARED_HOST_FIXTURE } from "@/tests/support/constants/admission-performance";
import { runAdmissionPerformanceWorkload, type AdmissionPerformanceConfirmation } from "@/tests/support/run-admission-performance-workload";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_HOSTING_ENV } from "@/src/modules/messaging/constants/messaging-hosting";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("shared native admission host configuration", () => {
  it("preserves actual admissions when another host imports the original external keys", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const environment = createAdmissionSyntheticHostingEnvironment();
      const seedingConfig = await readMessagingHostingSecurityConfig(environment);
      const hostingConfig = await readMessagingHostingSecurityConfig(environment);
      const { fixture, participants } = await prepareAdmissionPerformanceFixture(database, undefined, ADMISSION_SHARED_HOST_FIXTURE, seedingConfig);
      let confirmations: readonly AdmissionPerformanceConfirmation[] = [];
      const measurement = await runAdmissionPerformanceWorkload(database, { ...fixture, config: hostingConfig }, participants, { observeConfirmations: (observed) => { confirmations = observed; } }, ADMISSION_SHARED_HOST_FIXTURE.enabledParticipantCount);
      expect(measurement.failures).toEqual([]);
      expect(measurement.admitted).toBe(ADMISSION_SHARED_HOST_FIXTURE.enabledParticipantCount);
      expect(measurement.pending).toBe(ADMISSION_SHARED_HOST_FIXTURE.participantCount - ADMISSION_SHARED_HOST_FIXTURE.enabledParticipantCount);
      expect(measurement.facts).toEqual({ entries: ADMISSION_SHARED_HOST_FIXTURE.entryCount, requests: ADMISSION_SHARED_HOST_FIXTURE.participantCount, basic_members: ADMISSION_SHARED_HOST_FIXTURE.enabledParticipantCount, deliveries: 0 });
      expect(confirmations).toHaveLength(ADMISSION_SHARED_HOST_FIXTURE.participantCount);
      expect(new Set(confirmations.map((confirmation) => confirmation.index)).size).toBe(ADMISSION_SHARED_HOST_FIXTURE.participantCount);
      for (const confirmation of confirmations) {
        expect(confirmation.durationMs).toBeGreaterThanOrEqual(0);
        expect(confirmation.startedOffsetMs).toBeGreaterThanOrEqual(0);
        expect(confirmation.failure).toBeNull();
        expect(confirmation).not.toHaveProperty("cause");
        expect(confirmation).not.toHaveProperty("sessionToken");
      }
      expect(measurement.pool.waitingAfter).toBe(0);
      expect(measurement.pool.checkedOutAfter).toBe(0);
      expect(measurement.pool.acquisitions).toBe(measurement.pool.releases);
    }, { concurrentTransactions: ADMISSION_SHARED_HOST_FIXTURE.participantCount });
  }, ADMISSION_PERFORMANCE.nativeCaseTimeoutMs);

  it("closes commands with unrelated host keys without creating admission effects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const environment = createAdmissionSyntheticHostingEnvironment();
      const config = await readMessagingHostingSecurityConfig(environment);
      const otherEnvironment = createAdmissionSyntheticHostingEnvironment();
      otherEnvironment[MESSAGING_HOSTING_ENV.securityEpoch] = environment[MESSAGING_HOSTING_ENV.securityEpoch];
      const unrelatedConfig = await readMessagingHostingSecurityConfig(otherEnvironment);
      const { fixture, participants } = await prepareAdmissionPerformanceFixture(database, undefined, ADMISSION_SHARED_HOST_FIXTURE, config);
      const measurement = await runAdmissionPerformanceWorkload(database, { ...fixture, config: unrelatedConfig }, participants, undefined, ADMISSION_SHARED_HOST_FIXTURE.enabledParticipantCount);
      expect(measurement.failures).toHaveLength(ADMISSION_SHARED_HOST_FIXTURE.participantCount);
      expect(measurement.admitted).toBe(0);
      expect(measurement.pending).toBe(0);
      expect(measurement.facts).toEqual({ entries: ADMISSION_SHARED_HOST_FIXTURE.entryCount, requests: 0, basic_members: 0, deliveries: 0 });
    }, { concurrentTransactions: ADMISSION_SHARED_HOST_FIXTURE.participantCount });
  }, ADMISSION_PERFORMANCE.nativeCaseTimeoutMs);
});
