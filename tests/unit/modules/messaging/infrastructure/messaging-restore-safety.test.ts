/** @vitest-environment node */
/** Exercises real restored credential, proof and delivery history behind current external recovery controls. @module messaging-restore-safety-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { createAdmissionSyntheticHostingEnvironment } from "@/tests/support/admission-synthetic-hosting-environment";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { composeMessagingRestoreOwners, createMessagingRestoreSecurity, prepareMessagingRestoreSource, readMessagingRestoreFacts } from "@/tests/support/messaging-restore-fixture";
import { composeRestoreAdmissionOwners, prepareRestoreAdmissionCheckpoint, readRestoreAdmissionFacts } from "@/tests/support/messaging-restore-admission-fixture";
import { composeRestoreAdmissionDispatch } from "@/tests/support/messaging-restore-dispatch-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { prepareMessagingRestoreReplacement, admitAfterMessagingRestore } from "@/tests/support/messaging-restore-reopening-fixture";
import { seedMessagingCandidateExpiration } from "@/tests/support/messaging-candidate-expiration-fixture";
import { readMessagingRestoreHistory, seedMessagingRestoreManualPolicy } from "@/tests/support/messaging-restore-history-fixture";
import { buildMessagingRecoveryModule } from "@/src/modules/messaging/setup";
import type { MessagingRecoveryResult } from "@/src/modules/messaging/domain/repositories/messaging-recovery";
import { PostgresSecretMaterialMaintenance } from "@/src/modules/messaging/infrastructure/repositories/postgres-secret-material-maintenance";
import { readAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-storage";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
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
      const originalConfig = await readMessagingHostingSecurityConfig(createAdmissionSyntheticHostingEnvironment());
      const source = await prepareMessagingRestoreSource(parent, originalConfig);
      expect(source.fixture.fixture.fixture.config === originalConfig).toBe(true);
      reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.sourcePrepared);
      const prepared = await prepareRestoreAdmissionCheckpoint(parent, source);
      const historical = await seedMessagingCandidateExpiration(parent, source.fixture.fixture.fixture);
      const manualScope = historical.cases.find((candidate) => candidate.name === "selected")!;
      await seedMessagingRestoreManualPolicy(parent, manualScope.tribeId);
      const historyCheckpoint = await readMessagingRestoreHistory(parent, historical.cases);
      reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.checkpointPrepared);
      let currentConfig = originalConfig;
      const applicants = [prepared.applied.context.userId, prepared.available.context.userId, prepared.queued.context.userId, prepared.uncertain.context.userId];
      const snapshot = (database: Parameters<typeof readRestoreAdmissionFacts>[0]) => readRestoreAdmissionFacts(database, source.context.tribeId, applicants);
      const checkpoint = await snapshot(parent);
      const credentialCheckpoint = await readMessagingRestoreFacts(parent, source.context);
      await parent.grantTablesToNonBypass(["tenant_messaging_connections", "messaging_connection_versions", "messaging_secret_envelopes", "academy_admission_policies", "academy_admission_verification_proofs", "contact_verification_challenges", "message_deliveries"]);
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
          expect(currentConfig.keyrings.credential.keys.has(originalConfig.keyrings.credential.activeKeyId)).toBe(false);
          await expectDenied(messaging.secrets.loadAuthorizedSecret(source.context), "connection_incomplete");
          expect(decrypt).not.toHaveBeenCalled();
          reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.retiredKeyChecked);

          // Reconciliation has its own real backend context; ordinary adverse table grants cannot invoke it.
          currentConfig = recoveryConfig;
          const recoveryDependencies = {
            authorize: async () => true,
            readSecurityFacts: async () => ({ environment: currentConfig.environment, securityEpoch: currentConfig.securityEpoch, recoveryLocked: currentConfig.recoveryLocked }),
          };
          const recoveryInput = { tribeId: source.context.tribeId, environment: currentConfig.environment, securityEpoch: currentConfig.securityEpoch, sourceSecurityEpoch: originalConfig.securityEpoch, limit: 1 };
          const ordinaryRecovery = buildMessagingRecoveryModule({ ...recoveryDependencies, execute: (run) => copy.withContext({ userId: null, email: null }, run, "non_bypass") }).useCases.reconcileRecovery;
          await expectDenied(ordinaryRecovery.execute(recoveryInput), "permission_denied");
          await expect(copy.withContext({ userId: null, email: null }, (transaction) => transaction.execute(sql`select public.claim_messaging_recovery_scope(${source.context.tribeId})`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
          const recovery = buildMessagingRecoveryModule({ ...recoveryDependencies, execute: (run) => copy.withContext({ userId: null, email: null }, run) }).useCases.reconcileRecovery;
          expect(await recovery.inspect(recoveryInput)).toEqual({ remaining: true });
          let committedBatch: unknown, executions = 0;
          const responseLoss = new Error("Synthetic private recovery commit response lost");
          const lostResponse = buildMessagingRecoveryModule({ ...recoveryDependencies, execute: async (run) => {
            executions += 1;
            committedBatch = await copy.withContext({ userId: null, email: null }, run);
            throw responseLoss;
          } }).useCases.reconcileRecovery;
          await expect(lostResponse.execute(recoveryInput)).rejects.toMatchObject({ code: "operation_unresolved", cause: responseLoss });
          expect(executions).toBe(1);
          expect(await recovery.inspect(recoveryInput)).toEqual({ remaining: true });
          // Only the test-owned executor observed that original commit; the application received no invented counts.
          expect(committedBatch).toMatchObject({ policyClosed: true, connectionsSuspended: 1, remaining: true });
          const batches = [committedBatch as MessagingRecoveryResult];
          expect(batches[0]).toMatchObject({ policyClosed: true, connectionsSuspended: 1, remaining: true });
          const maximumBatches = checkpoint.challenges.length + checkpoint.proofs.length + credentialCheckpoint.secret.length;
          for (let batchIndex = 1; batches.at(-1)!.remaining && batchIndex < maximumBatches; batchIndex += 1) batches.push(await recovery.execute(recoveryInput));
          expect(batches.at(-1)!.remaining).toBe(false);
          expect(batches.reduce((total, batch) => total + Number(batch.policyClosed), 0)).toBe(1);
          expect(batches.reduce((total, batch) => total + batch.versionsRetired, 0)).toBe(credentialCheckpoint.versions.filter((version) => version.retired_at === null).length);
          expect(batches.reduce((total, batch) => total + batch.secretsRetired, 0)).toBe(credentialCheckpoint.secret.filter((secret) => secret.retired_at === null).length);
          for (const batch of batches) for (const count of [batch.connectionsSuspended, batch.candidateSlotsReleased, batch.versionsRetired, batch.secretsRetired, batch.proofsInvalidated, batch.challengesInvalidated, batch.queuedDeliveriesCancelled]) expect(count <= recoveryInput.limit).toBe(true);
          expect(await recovery.inspect(recoveryInput)).toEqual({ remaining: false });
          expect(await recovery.execute(recoveryInput)).toEqual({ policyClosed: false, connectionsSuspended: 0, candidateSlotsReleased: 0, versionsRetired: 0, secretsRetired: 0, proofsInvalidated: 0, challengesInvalidated: 0, queuedDeliveriesCancelled: 0, remaining: false });
          const reconciled = await snapshot(copy);
          expect(reconciled.policy).toMatchObject({ is_open: false, requires_additional_verification: true });
          expect(reconciled.proofs.filter((proof) => proof.id === prepared.applied.proofId || proof.id === prepared.available.proofId)).toEqual(expect.arrayContaining([expect.objectContaining({ id: prepared.applied.proofId, status: "invalid" }), expect.objectContaining({ id: prepared.available.proofId, status: "invalid" })]));
          expect(reconciled.memberships).toEqual([]);
          expect(reconciled.requests).toEqual(checkpoint.requests);
          expect(reconciled.attempts).toEqual(checkpoint.attempts);
          expect(reconciled.reservations).toEqual(checkpoint.reservations);
          expect(reconciled.deliveries.find((delivery) => delivery.id === prepared.uncertain.original.deliveryId)).toEqual(checkpoint.deliveries.find((delivery) => delivery.id === prepared.uncertain.original.deliveryId));
          expect((await readMessagingRestoreFacts(copy, source.context)).connection).toMatchObject({ state: "suspended", is_selected: true });
          expect(decrypt).not.toHaveBeenCalled();
          expect(transport.receipts).toEqual([]);
          // The operator's known synthetic inventory also includes independent old selected/candidate scopes.
          for (const candidate of historical.cases) {
            const input = { ...recoveryInput, tribeId: candidate.tribeId };
            let result = await recovery.execute(input);
            const maximumHistoryBatches = historyCheckpoint.filter((row) => row.connection_id === candidate.connectionId).length + 1;
            for (let batchIndex = 1; result.remaining && batchIndex < maximumHistoryBatches; batchIndex += 1) result = await recovery.execute(input);
            expect(result.remaining).toBe(false);
            expect(await recovery.inspect(input)).toEqual({ remaining: false });
          }
          const recoveredHistory = await readMessagingRestoreHistory(copy, historical.cases);
          expect(recoveredHistory.map((row) => ({ connection_id: row.connection_id, version: row.version, last_activity_at: row.last_activity_at }))).toEqual(historyCheckpoint.map((row) => ({ connection_id: row.connection_id, version: row.version, last_activity_at: row.last_activity_at })));
          for (const row of recoveredHistory) {
            expect(row).toMatchObject({ state: "suspended", is_candidate: false, matching_secret_deadline: true, has_material: true, purged: false });
            expect(row.retired_at).not.toBeNull();
            const candidate = historical.cases.find((candidate) => candidate.connectionId === row.connection_id)!;
            if (candidate.candidateVersion === row.version && candidate.selectedVersion !== row.version) {
              expect(row.no_idle_extension).toBe(true);
              if (candidate.name !== "fresh") expect(row).toMatchObject({ original_idle_cutoff: true, original_idle_purge: true });
            }
          }
          expect(decrypt).not.toHaveBeenCalled();
          reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.recoveryReconciled);
        } finally {
          decrypt.mockRestore();
        }

        // The operator now permits preparation while every restored admission policy remains closed.
        // Retained MAC/index keys preserve original operation and contact accounting; the old credential key stays absent.
        const keyrings = { ...recoveryConfig.keyrings };
        for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) if (purpose !== MESSAGING_KEY_PURPOSE.credential) keyrings[purpose] = { ...keyrings[purpose], keys: new Map([...originalConfig.keyrings[purpose].keys, ...keyrings[purpose].keys]) };
        currentConfig = { ...recoveryConfig, recoveryLocked: false, keyrings };
        await copy.withContext({ userId: null, email: null }, async (transaction) => {
          await registerMessagingPrivateMacKeyMaterial(transaction, currentConfig, MESSAGING_KEY_PURPOSE.operationPayload);
          await registerMessagingPrivateMacKeyMaterial(transaction, currentConfig, MESSAGING_KEY_PURPOSE.contactFingerprint);
        });
        // The already elapsed candidate purge deadline is not renewed by restore or by delayed maintenance.
        expect(await new PostgresSecretMaterialMaintenance((run) => copy.withContext({ userId: null, email: null }, run), async () => !currentConfig.recoveryLocked).purgeRetired(1)).toBe(1);
        const purgedHistory = await readMessagingRestoreHistory(copy, historical.cases);
        const lateCandidate = historical.cases.find((candidate) => candidate.name === "late")!;
        expect(purgedHistory.find((row) => row.connection_id === lateCandidate.connectionId)).toMatchObject({ has_material: false, purged: true, original_idle_cutoff: true, original_idle_purge: true });
        const pausedManualPolicy = await copy.withContext({ userId: null, email: null }, (transaction) => readAdmissionPolicy(transaction, manualScope.tribeId, false));
        expect(pausedManualPolicy).toMatchObject({ isOpen: false, requiresAdditionalVerification: false });
        // The submission writer exposes a paused domain denial as admission_ineligible; verify closure and zero effects separately.
        await expectDenied(admissions.requests.submit({ ...submission, ...prepared.queued.context, tribeId: manualScope.tribeId, operationId: randomUUID(), expectedPolicyVersion: pausedManualPolicy!.version, proofId: null, contact: prepared.queued.contact }), ADMISSION_ERROR_CODE.admissionIneligible);
        expect(await copy.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute(sql`select
          (select count(*)::integer from public.academy_admission_requests where tribe_id=${manualScope.tribeId}) as requests,
          (select count(*)::integer from public.tribe_members where tribe_id=${manualScope.tribeId} and role='tribemate') as basic_members`)).rows[0])).toEqual({ requests: 0, basic_members: 0 });
        expect(currentConfig.keyrings.credential.keys.has(originalConfig.keyrings.credential.activeKeyId)).toBe(false);
        const replacement = await prepareMessagingRestoreReplacement(copy, source, currentConfig);
        expect(replacement.context.connectionId).not.toBe(source.context.connectionId);
        expect(replacement.closedPolicy.isOpen).toBe(false);
        expect(await replacement.owners.secrets.loadAuthorizedSecret(replacement.context) === replacement.replacement.credential).toBe(true);
        await expectDenied(messaging.secrets.loadAuthorizedSecret(source.context), "resource_unavailable");
        expect(await replacement.admission.preflight.execute({ tribeId: source.context.tribeId, requestId: randomUUID() })).toMatchObject({ ok: true, value: { prepared: true } });
        reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.replacementPrepared);
        const fresh = await admitAfterMessagingRestore(copy, source, prepared, replacement, currentConfig, reportPhase);
        expect(fresh.dispatch).toMatchObject({ authorized: 1, accepted: 1, unknown: 0 });
        expect(fresh.receipts).toBe(1); expect(fresh.deniedRequests).toBe(0);
        expect(fresh.decided).toMatchObject({ state: "completed", result: { status: "approved" } });
        expect([prepared.applied.proofId, prepared.available.proofId]).not.toContain(fresh.proofId);
        const reopened = await snapshot(copy);
        expect(reopened.memberships).toEqual([{ user_id: prepared.queued.context.userId, role: "tribemate", status: "active" }]);
        expect(reopened.requests.find((request) => request.id === prepared.applied.requestId)).toEqual(checkpoint.requests.find((request) => request.id === prepared.applied.requestId));
        expect(reopened.deliveries.find((delivery) => delivery.id === prepared.uncertain.original.deliveryId)).toEqual(checkpoint.deliveries.find((delivery) => delivery.id === prepared.uncertain.original.deliveryId));
        expect(await snapshot(parent)).toEqual(checkpoint);
        expect(await readMessagingRestoreHistory(parent, historical.cases)).toEqual(historyCheckpoint);
        reportPhase(MESSAGING_RESTORE_SAFETY_PHASE.freshAdmissionConfirmed);
      });
    });
  }, MESSAGING_RESTORE_SAFETY_TEST_TIMEOUT_MS);
});
