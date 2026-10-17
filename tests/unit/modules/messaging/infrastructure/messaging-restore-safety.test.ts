/** @vitest-environment node */
/** Exercises real restored credential, proof and delivery history behind current external recovery controls. @module messaging-restore-safety-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { composeMessagingRestoreOwners, createMessagingRestoreSecurity, prepareMessagingRestoreSource, readMessagingRestoreFacts, refreshMessagingRestoreCheckpointAuthority } from "@/tests/support/messaging-restore-fixture";
import { composeRestoreAdmissionOwners, prepareRestoreAdmissionCheckpoint, readRestoreAdmissionFacts } from "@/tests/support/messaging-restore-admission-fixture";
import { composeRestoreAdmissionDispatch } from "@/tests/support/messaging-restore-dispatch-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { MESSAGING_RESTORE_SAFETY_TEST_TIMEOUT_MS, MESSAGING_RESTORE_SAFETY_PHASE, type MessagingRestoreSafetyPhase } from "@/tests/support/constants/messaging-restore-safety";

/** @param phase - Completed native milestone or initial launch. @returns No private state; only safe progress for the explicitly enabled native runner. */
function reportPhase(phase: MessagingRestoreSafetyPhase): void { console.info(JSON.stringify({ phase })); }

/**
 * Stops immediately on an unauthorized success, while collecting public-code mismatches across the same costly native run.
 * @param operation - Actual guarded operation; its resolved private value is never retained or logged.
 * @param expectedCode - Literal public error contract for this rejected action.
 * @returns After a hard rejection assertion and a soft code assertion, which still fails the complete test on mismatch.
 */
async function expectDenied(operation: Promise<unknown>, expectedCode: string): Promise<void> {
  let rejected = false, caughtError: unknown;
  try { await operation; } catch (error) { rejected = true; caughtError = error; }
  expect(rejected).toBe(true);
  const observedCode = caughtError !== null && typeof caughtError === "object" && "code" in caughtError ? caughtError.code : undefined;
  expect.soft(observedCode).toBe(expectedCode);
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native messaging restore safety", () => {
  it("should reject restored retired credentials, old proofs and outbox before decryption or admission while preserving uncertain consumption", async () => {
    await withAcademyAdmissionDatabase(async (parent) => {
      // Arrange: every challenge/proof and the open ON policy come from their actual native owners.
      reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.initializing);
      let source = await prepareMessagingRestoreSource(parent);
      reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.sourcePrepared);
      const originalConfig = source.fixture.fixture.fixture.config;
      const prepared = await prepareRestoreAdmissionCheckpoint(parent, source);
      source = await refreshMessagingRestoreCheckpointAuthority(parent, source);
      reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.checkpointPrepared);
      let currentConfig = originalConfig;
      const applicants = [prepared.applied.context.userId, prepared.available.context.userId, prepared.queued.context.userId, prepared.uncertain.context.userId];
      const snapshot = (database: Parameters<typeof readRestoreAdmissionFacts>[0]) => readRestoreAdmissionFacts(database, source.context.tribeId, applicants);
      const checkpoint = await snapshot(parent);
      const credentialCheckpoint = await readMessagingRestoreFacts(parent, source.context);
      expect(credentialCheckpoint.connection).toMatchObject({ state: "active", is_selected: true, retired_at: null });
      // Native configuration creates version2 and retires version1; recovery must preserve both histories.
      expect(credentialCheckpoint.secret.map((secret) => secret.connection_version)).toEqual([1, 2]);
      expect(credentialCheckpoint.secret.find((secret) => secret.connection_version === source.context.connectionVersion)).toMatchObject({ retired_at: null, purged_at: null, has_bytes: true });
      expect(credentialCheckpoint.secret.find((secret) => secret.connection_version === 1)).toMatchObject({ retired_at: expect.anything(), purge_after: expect.anything(), has_bytes: true });
      expect(await source.owners.secrets.loadAuthorizedSecret(source.context) === source.fixture.credential).toBe(true);
      expect(checkpoint.policy).toMatchObject({ is_open: true, requires_additional_verification: true });
      expect(checkpoint.memberships).toEqual([]);
      expect(checkpoint.proofs).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: prepared.applied.proofId, status: "applied" }),
        expect.objectContaining({ id: prepared.available.proofId, status: "available" }),
      ]));
      expect(checkpoint.deliveries).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: prepared.queued.original.deliveryId, state: "queued" }),
        expect.objectContaining({ id: prepared.uncertain.original.deliveryId, state: "unknown" }),
      ]));
      const approval = {
        userId: source.context.actorUserId, sessionId: source.context.sessionId, tribeId: source.context.tribeId,
        requestId: randomUUID(), operationId: randomUUID(), type: "decide_admission_request" as const, confirmed: true as const,
        admissionRequestId: prepared.applied.requestId, expectedVersion: prepared.applied.requestVersion,
        decision: "approve" as const, internalReason: "Revisión sintética de recuperación", externalMessage: null,
      };
      const submission = {
        ...prepared.available.context, operationId: randomUUID(), type: "submit_admission" as const, confirmed: true as const,
        expectedPolicyVersion: prepared.policy.version, source: { kind: "common" as const },
        contact: prepared.available.contact, proofId: prepared.available.proofId, message: null,
      };
      await parent.withRestorableCopy(async (copy) => {
        reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.copyReady);
        const admissions = composeRestoreAdmissionOwners(copy, source, async () => currentConfig);
        const messaging = composeMessagingRestoreOwners(copy, source.fixture, async () => currentConfig);
        expect(await messaging.secrets.loadAuthorizedSecret(source.context) === source.fixture.credential).toBe(true);
        // The same original proof is demonstrably usable before retirement; its later rejection is not a dead fixture.
        expect(await admissions.requests.decide(approval)).toMatchObject({ state: "completed", result: { status: "approved" } });
        expect((await snapshot(copy)).memberships).toEqual([{ user_id: prepared.applied.context.userId, role: "tribemate", status: "active" }]);
        const paused = await admissions.policy.update({ tribeId: source.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedVersion: prepared.policy.version, confirmed: true, patch: { isOpen: false, requiresAdditionalVerification: false } });
        expect(paused).toMatchObject({ ok: true, value: { state: "completed" } });
        expect(await messaging.disconnection.disconnect(source.retirementContext, { operationId: randomUUID(), expectedVersion: source.activated.version, confirmed: true })).toMatchObject({ state: "completed", result: { state: "disconnected", changed: true } });
        const retiredCredential = await readMessagingRestoreFacts(copy, source.context);
        expect(retiredCredential.connection).toMatchObject({ state: "disconnected", is_selected: false, retired_at: expect.anything() });
        for (const secret of retiredCredential.secret) expect(secret).toMatchObject({ retired_at: expect.anything(), purge_after: expect.anything(), has_bytes: true });
        await expectDenied(messaging.secrets.loadAuthorizedSecret(source.context), "resource_unavailable");
        const retired = await snapshot(copy);
        expect(retired.proofs).toEqual(expect.arrayContaining([expect.objectContaining({ id: prepared.available.proofId, status: "invalid" })]));
        expect(retired.deliveries).toEqual(expect.arrayContaining([expect.objectContaining({ id: prepared.queued.original.deliveryId, state: "cancelled" })]));
        reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.retirementConfirmed);

        // Act: external state remains outside the SQL checkpoint while its old rows genuinely return.
        const recoveryConfig = await createMessagingRestoreSecurity(originalConfig);
        currentConfig = recoveryConfig;
        await copy.restoreFromParent();
        expect(await snapshot(copy)).toEqual(checkpoint);
        expect(await snapshot(parent)).toEqual(checkpoint);
        expect(await readMessagingRestoreFacts(copy, source.context)).toEqual(credentialCheckpoint);
        reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.restored);
        expect(Date.now() < new Date(prepared.available.applyBefore).getTime()).toBe(true);
        const queuedChallenge = checkpoint.challenges.find((challenge) => challenge.id === prepared.queued.original.challengeId);
        expect(queuedChallenge).toBeDefined();
        expect(Date.now() < new Date(String(queuedChallenge!.expires_at)).getTime()).toBe(true);

        const transport = createAdmissionProviderTransport([]);
        const dispatcher = composeRestoreAdmissionDispatch(copy, source, prepared.queued, async () => currentConfig, transport);
        // Observation retains native Web Crypto; no platform implementation or internal SDK is mocked.
        const decrypt = vi.spyOn(crypto.subtle, "decrypt");
        try {
          expect(await admissions.preflight.execute({ tribeId: source.context.tribeId, requestId: randomUUID() })).toMatchObject({ ok: true, value: { prepared: false } });
          expect(Date.now() < source.context.validUntil.getTime()).toBe(true);
          await expectDenied(messaging.secrets.loadAuthorizedSecret(source.context), "connection_incomplete");
          await expectDenied(messaging.activation.activate(source.fixture.context, { ...source.fixture.input, operationId: randomUUID(), expectedVersion: source.activated.version }), "connection_incomplete");
          await expectDenied(admissions.requests.decide({ ...approval, operationId: randomUUID() }), "resource_unavailable");
          await expectDenied(admissions.requests.submit({ ...submission, operationId: randomUUID() }), "resource_unavailable");
          await expectDenied(admissions.verification.verify({ ...prepared.queued.context, operationId: randomUUID(), challengeId: prepared.queued.original.challengeId, verificationCode: prepared.queuedVerificationCode }), "resource_unavailable");
          expect(await dispatcher.run()).toMatchObject({ authorized: 0, accepted: 0, delivered: 0, unknown: 0 });
          expect(decrypt).not.toHaveBeenCalled();
          expect(transport.receipts).toEqual([]); expect(transport.deniedRequests).toBe(0);
          reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.recoveryLockChecked);

          // Retaining every old key does not make an old resource/proof current in the new external epoch.
          currentConfig = { ...originalConfig, securityEpoch: currentConfig.securityEpoch, recoveryLocked: false };
          expect(Date.now() < source.context.validUntil.getTime()).toBe(true);
          expect(Date.now() < new Date(String(queuedChallenge!.expires_at)).getTime()).toBe(true);
          await expectDenied(messaging.secrets.loadAuthorizedSecret(source.context), "connection_incomplete");
          const invalidCode = await admissions.verification.verify({ ...prepared.queued.context, operationId: randomUUID(), challengeId: prepared.queued.original.challengeId, verificationCode: prepared.queuedVerificationCode });
          expect(invalidCode.state).toBe("completed");
          if (invalidCode.state === "completed") {
            expect(invalidCode.result.result).toBe("denied");
            if (invalidCode.result.result === "denied") expect.soft(invalidCode.result.code).toBe("challenge_invalidated");
          }
          await expectDenied(admissions.requests.decide({ ...approval, operationId: randomUUID() }), "proof_unavailable");
          await expectDenied(admissions.requests.submit({ ...submission, operationId: randomUUID() }), "additional_verification_required");
          expect(await dispatcher.run()).toMatchObject({ authorized: 0, accepted: 0, delivered: 0, unknown: 0 });
          expect(decrypt).not.toHaveBeenCalled();
          expect(transport.receipts).toEqual([]); expect(transport.deniedRequests).toBe(0);
          const closed = await snapshot(copy);
          expect(closed.memberships).toEqual([]);
          expect(closed.requests).toEqual(checkpoint.requests);
          expect(closed.proofs.map((proof) => proof.id)).toEqual(checkpoint.proofs.map((proof) => proof.id));
          expect(closed.attempts).toEqual(checkpoint.attempts);
          expect(closed.reservations).toEqual(checkpoint.reservations);
          expect(closed.deliveries.find((delivery) => delivery.id === prepared.uncertain.original.deliveryId)).toEqual(checkpoint.deliveries.find((delivery) => delivery.id === prepared.uncertain.original.deliveryId));
          reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.externalEpochChecked);
          // Isolate key retirement: even a matching epoch cannot open bytes after their credential key is removed.
          currentConfig = { ...recoveryConfig, securityEpoch: originalConfig.securityEpoch, recoveryLocked: false };
          expect(Date.now() < source.context.validUntil.getTime()).toBe(true);
          expect(currentConfig.keyrings.credential.keys.has(originalConfig.keyrings.credential.activeKeyId)).toBe(false);
          await expectDenied(messaging.secrets.loadAuthorizedSecret(source.context), "connection_incomplete");
          expect(decrypt).not.toHaveBeenCalled();
          reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.retiredKeyChecked);
        } finally {
          decrypt.mockRestore();
        }
      });
    });
  }, MESSAGING_RESTORE_SAFETY_TEST_TIMEOUT_MS);
});
