/** Owns the complete real Node restore scenario, retaining all private configuration outside PostgreSQL. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { withAcademyAdmissionDatabase } from "./academy-admission-database";
import { createAdmissionSyntheticHostingEnvironment } from "./admission-synthetic-hosting-environment";
import { prepareMessagingRestoreSource, refreshMessagingRestoreCheckpointAuthority } from "./messaging-restore-fixture";
import { prepareRestoreAdmissionCheckpoint } from "./messaging-restore-admission-fixture";
import { seedMessagingCandidateExpiration } from "./messaging-candidate-expiration-fixture";
import { seedMessagingRestoreManualPolicy } from "./messaging-restore-history-fixture";
import { refreshMessagingActivationRecency } from "./messaging-activation-native";
import { readMessagingRestoreFacts, readMessagingRestoreHistory, readRestoreAdmissionFacts } from "./messaging-restore-observations-native";
import { MessagingNodeHostFailure, summarizeMessagingNodeHostFailure } from "./messaging-node-host-failure";
import { deployOwnedMessagingNodes, type OwnedMessagingNodeDeployment } from "./owned-messaging-node-deployment";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_HOSTING_ENV, MESSAGING_RECOVERY_LOCK_VALUE } from "@/src/modules/messaging/constants/messaging-hosting";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { ADMISSION_NODE_HOST, ADMISSION_NODE_RUN_STATE, admissionNodeStatusSchema, type AdmissionNodeStatus } from "./constants/admission-node-host";
import { MESSAGING_NATIVE_ACTIVATION } from "./constants/messaging-activation-native";
import { MESSAGING_RESTORE_NODE_HOST as HOST, MESSAGING_RESTORE_NODE_PHASE as PHASE, messagingRestoreNodeInputSchema, type MessagingRestoreNodeInput, type MessagingRestoreNodePhase } from "./constants/messaging-restore-node-host";

type StoredPhase = { state: string; work_runs: number; cipher_operations: number; checked_rejections: number; provider_requests: number; invitation_round_trip: boolean; runtime_version: string; source_commit: string; bundle_sha256: string };
export type MessagingNodeHostRestoreObservation = {
  cohortId: string; startedAt: string; passed: boolean; realMessages: 0;
  phase?: string; branchId?: string; copyId?: string;
  phases: Array<{ phase: MessagingRestoreNodePhase; operationId: string; slug: string; sourceCommit: string; bundleSha256: string; observation: StoredPhase }>;
  requests: Array<{ phase: MessagingRestoreNodePhase; method: string; stage: string; status: number; code?: string }>;
  profileOutsideSqlSurvivedRestore?: boolean; originalRecordsPreserved?: boolean;
  inputsStable?: boolean; privateMaterialAbsent?: boolean; functionsRemoved?: boolean; branchesRemoved?: boolean;
  deploymentAttempts?: number; auditedReturnedDeployments?: number;
  failure?: { stage: string; name: string; code: string | null; causes: Array<{ name: string; code: string | null }> };
};

/** @param context - Actual original internal scope. @returns Its own private transport shape without unrelated fixture fields. */
function authorizedInput(context: AuthorizedMessagingContext) {
  return { actorUserId: context.actorUserId, sessionId: context.sessionId, tribeId: context.tribeId, requestId: context.requestId, accountId: context.accountId, subject: context.subject, resourceId: context.resourceId, authenticatedAt: context.authenticatedAt, validUntil: context.validUntil, authorizationPurpose: context.authorizationPurpose, connectionId: context.connectionId, connectionVersion: context.connectionVersion, environment: context.environment, securityEpoch: context.securityEpoch, secretRef: context.secretRef, operation: context.operation };
}

/**
 * Runs one complete scenario; uncertain HTTP operations are observed through their original GET, never reposted.
 * @param options - Explicit safe progress and public receipt destination only.
 * @returns A sanitized outcome after exact own-resource cleanup; private exceptions never enter the receipt.
 */
export async function runMessagingNodeHostRestore(options: { reportFile?: string; onPhase?: (phase: string) => void } = {}): Promise<MessagingNodeHostRestoreObservation> {
  const report: MessagingNodeHostRestoreObservation = { cohortId: randomUUID(), startedAt: new Date().toISOString(), passed: false, realMessages: 0, phases: [], requests: [] };
  const persist = async () => { if (options.reportFile) await writeFile(options.reportFile, JSON.stringify(report, null, 2)); };
  const progress = async (phase: string) => { report.phase = phase; options.onPhase?.(phase); await persist(); };
  let failure: unknown;
  try {
    await withAcademyAdmissionDatabase(async (parent) => {
      report.branchId = parent.branch.id;
      await progress("source_preparing");
      const originalEnvironment: Record<string, string> = { ...createAdmissionSyntheticHostingEnvironment(), [MESSAGING_HOSTING_ENV.environment]: HOST.securityEnvironment };
      const originalConfig = await readMessagingHostingSecurityConfig(originalEnvironment);
      let source = await prepareMessagingRestoreSource(parent, originalConfig);
      const prepared = await prepareRestoreAdmissionCheckpoint(parent, source);
      const history = await seedMessagingCandidateExpiration(parent, source.fixture.fixture.fixture);
      const manual = history.cases.find((candidate) => candidate.name === "selected");
      assert.ok(manual);
      await seedMessagingRestoreManualPolicy(parent, manual.tribeId);
      const migration = await readFile(HOST.supportMigration, "utf8");
      await parent.withContext({ userId: null, email: null }, (transaction) => transaction.execute(sql.raw(migration)));
      source = await refreshMessagingRestoreCheckpointAuthority(parent, source);
      const applicants = [prepared.applied.context.userId, prepared.available.context.userId, prepared.queued.context.userId, prepared.uncertain.context.userId];
      const snapshot = (database: Parameters<typeof readRestoreAdmissionFacts>[0]) => readRestoreAdmissionFacts(database, source.context.tribeId, applicants);
      const checkpoint = await snapshot(parent), credentialCheckpoint = await readMessagingRestoreFacts(parent, source.context), historyCheckpoint = await readMessagingRestoreHistory(parent, history.cases);
      const rotatedEnvironment: Record<string, string> = { ...createAdmissionSyntheticHostingEnvironment(), [MESSAGING_HOSTING_ENV.environment]: HOST.securityEnvironment };
      const lockedEnvironment = { ...rotatedEnvironment, [MESSAGING_HOSTING_ENV.recoveryLock]: MESSAGING_RECOVERY_LOCK_VALUE.locked };
      const originalLockedEnvironment = { ...originalEnvironment, [MESSAGING_HOSTING_ENV.recoveryLock]: MESSAGING_RECOVERY_LOCK_VALUE.locked };
      const epochEnvironment = { ...originalEnvironment, [MESSAGING_HOSTING_ENV.securityEpoch]: rotatedEnvironment[MESSAGING_HOSTING_ENV.securityEpoch] };
      const retiredKeyEnvironment = { ...rotatedEnvironment, [MESSAGING_HOSTING_ENV.securityEpoch]: originalEnvironment[MESSAGING_HOSTING_ENV.securityEpoch] };
      const originalRings = JSON.parse(originalEnvironment[MESSAGING_HOSTING_ENV.keyrings]) as Record<string, { activeKeyId: string; keys: Array<{ id: string; materialBase64: string }> }>;
      const mergedRings = JSON.parse(rotatedEnvironment[MESSAGING_HOSTING_ENV.keyrings]) as typeof originalRings;
      for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) if (purpose !== MESSAGING_KEY_PURPOSE.credential) mergedRings[purpose].keys = [...originalRings[purpose].keys, ...mergedRings[purpose].keys];
      const reopenedEnvironment = { ...rotatedEnvironment, [MESSAGING_HOSTING_ENV.keyrings]: JSON.stringify(mergedRings) };
      const phaseIds = Object.fromEntries(Object.values(PHASE).map((phase) => [phase, randomUUID()])) as Record<MessagingRestoreNodePhase, string>;

      await parent.withRestorableCopy(async (copy) => {
        report.copyId = copy.branch.id;
        let active: { deployment: OwnedMessagingNodeDeployment; token: string; phase: MessagingRestoreNodePhase } | undefined;
        const deployments: OwnedMessagingNodeDeployment[] = [];
        /** @param afterRestore - Never resurrects the old unlocked baseline receipt after rollback. */
        async function registerPhases(afterRestore: boolean) {
          await copy.withContext({ userId: null, email: null }, async (transaction) => {
            for (const phase of Object.values(PHASE)) {
              if (afterRestore && phase === PHASE.baseline) continue;
              await transaction.execute(sql`insert into native_test_support.messaging_restore_phases(id,cohort_id,expected_branch,phase) values (${phaseIds[phase]},${report.cohortId},${copy.branch.name},${phase})`);
            }
          });
        }
        async function stop() {
          if (!active) return;
          await active.deployment.assertInputsUnchanged();
          await active.deployment.assertPrivateMaterialAbsent();
          await active.deployment.remove();
          active = undefined;
        }
        /** Re-seals actual current synthetic authority without changing any product authentication deadline. */
        async function phaseInput(phase: MessagingRestoreNodePhase, environment: Record<string, string>): Promise<MessagingRestoreNodeInput> {
          const usesFrozenAuthority = phase === PHASE.baseline || phase === PHASE.locked;
          const secretRecency = usesFrozenAuthority ? source.context : await refreshMessagingActivationRecency(copy, source.fixture.fixture, REAUTHENTICATION_OPERATION.readMessagingSenders, source.context.connectionId);
          const activationRecency = usesFrozenAuthority ? source.fixture.context : await refreshMessagingActivationRecency(copy, source.fixture.fixture, REAUTHENTICATION_OPERATION.activateMessagingConnection, source.context.connectionId);
          const retirementRecency = usesFrozenAuthority ? source.retirementContext : await refreshMessagingActivationRecency(copy, source.fixture.fixture, REAUTHENTICATION_OPERATION.disconnectMessagingConnection, source.context.connectionId);
          const creationRecency = usesFrozenAuthority ? source.fixture.fixture.context : await refreshMessagingActivationRecency(copy, source.fixture.fixture, REAUTHENTICATION_OPERATION.saveMessagingCredentials, source.context.tribeId);
          if (!usesFrozenAuthority) for (const operation of [REAUTHENTICATION_OPERATION.updateAdmissionPolicy, REAUTHENTICATION_OPERATION.activateAdmissionPolicy]) await refreshMessagingActivationRecency(copy, source.fixture.fixture, operation, source.context.tribeId);
          const creation = source.fixture.fixture.context;
          return messagingRestoreNodeInputSchema.parse({ operationId: phaseIds[phase], cohortId: report.cohortId, phase, expected: { environment: environment[MESSAGING_HOSTING_ENV.environment], securityEpoch: environment[MESSAGING_HOSTING_ENV.securityEpoch], recoveryLocked: environment[MESSAGING_HOSTING_ENV.recoveryLock] === MESSAGING_RECOVERY_LOCK_VALUE.locked }, source: {
            context: authorizedInput({ ...source.context, ...secretRecency }), activationContext: authorizedInput({ ...source.fixture.context, ...activationRecency }), retirementContext: authorizedInput({ ...source.fixture.context, ...source.retirementContext, ...retirementRecency }),
            creationContext: { actorUserId: creation.actorUserId, sessionId: creation.sessionId, tribeId: creation.tribeId, requestId: creation.requestId, accountId: creation.accountId, subject: creation.subject, resourceId: creation.resourceId, operation: creation.operation, ...creationRecency },
            ownEmail: source.fixture.fixture.fixture.own.email, originalCredential: source.fixture.credential, originalKeyIds: Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => [purpose, originalConfig.keyrings[purpose].activeKeyId])), activatedVersion: source.activated.version, policyVersion: prepared.policy.version, nonBypassRoleName: parent.nonBypassRole.name,
            applied: { context: prepared.applied.context, contact: prepared.applied.contact, proofId: prepared.applied.proofId, requestId: prepared.applied.requestId, requestVersion: prepared.applied.requestVersion, applyBefore: prepared.applied.applyBefore },
            available: { context: prepared.available.context, contact: prepared.available.contact, proofId: prepared.available.proofId, applyBefore: prepared.available.applyBefore },
            queued: { context: prepared.queued.context, contact: prepared.queued.contact, original: { challengeId: prepared.queued.original.challengeId, deliveryId: prepared.queued.original.deliveryId }, code: prepared.queuedVerificationCode, expiresAt: prepared.queued.original.expiresAt }, uncertainDeliveryId: prepared.uncertain.original.deliveryId, manualTribeId: manual!.tribeId, history: history.cases,
          } });
        }
        async function start(phase: MessagingRestoreNodePhase, environment: Record<string, string>) {
          await stop();
          await progress(`deploy_${phase}`);
          const token = randomBytes(ADMISSION_NODE_HOST.tokenBytes).toString("base64url"), input = await phaseInput(phase, environment);
          report.deploymentAttempts = (report.deploymentAttempts ?? 0) + 1;
          const deployment = await deployOwnedMessagingNodes(copy.branch, phaseIds[phase], token, environment, [input], { entrypoint: HOST.entrypoint, privateInputVariable: HOST.inputVariable, supportingFiles: [HOST.supportMigration, HOST.coordinator, HOST.testFile], sensitiveValues: [source.fixture.credential, prepared.queuedVerificationCode] });
          deployments.push(deployment);
          active = { deployment, token, phase };
          const anonymous = await fetch(new URL(ADMISSION_NODE_HOST.statusPath, deployment.hosts[0].url), { redirect: "error", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
          assert.equal(anonymous.status, 401);
          assert.equal((await status("prepared")).state, ADMISSION_NODE_RUN_STATE.prepared);
        }
        async function status(stage: string): Promise<AdmissionNodeStatus> {
          assert.ok(active);
          const response = await fetch(new URL(ADMISSION_NODE_HOST.statusPath, active.deployment.hosts[0].url), { headers: { authorization: `${ADMISSION_NODE_HOST.tokenPrefix}${active.token}` }, redirect: "error", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
          report.requests.push({ phase: active.phase, method: "GET", stage, status: response.status });
          assert.ok(response.status === 200 || response.status === 202 || response.status === 500);
          const body = await response.json() as Record<string, unknown>;
          if (response.status === 500 && typeof body.code === "string" && ADMISSION_NODE_HOST.failureCodePattern.test(body.code)) throw new MessagingNodeHostFailure(body.code);
          const result = admissionNodeStatusSchema.parse(body);
          assert.equal(result.operationId, phaseIds[active.phase]);
          return result;
        }
        async function executePhase() {
          assert.ok(active);
          const current = active;
          await progress(`run_${current.phase}`);
          let reportedFailureCode: string | undefined;
          try {
            const response = await fetch(new URL(ADMISSION_NODE_HOST.runPath, current.deployment.hosts[0].url), { method: "POST", headers: { authorization: `${ADMISSION_NODE_HOST.tokenPrefix}${current.token}` }, redirect: "error", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
            if (response.status === 500) {
              const body = await response.json() as Record<string, unknown>;
              if (typeof body.code === "string" && ADMISSION_NODE_HOST.failureCodePattern.test(body.code)) reportedFailureCode = body.code;
            }
            report.requests.push({ phase: current.phase, method: "POST", stage: "run", status: response.status, ...(reportedFailureCode ? { code: reportedFailureCode } : {}) });
          } catch { report.requests.push({ phase: current.phase, method: "POST", stage: "uncertain_response", status: 0 }); }
          let observed = await status("original_after_run");
          const deadline = Date.now() + ADMISSION_NODE_HOST.requestTimeoutMs;
          while (observed.state === ADMISSION_NODE_RUN_STATE.running && Date.now() < deadline) { await delay(1000); observed = await status("original_wait"); }
          if (observed.state === ADMISSION_NODE_RUN_STATE.failed) {
            const failureRow = await copy.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ failure_code: string | null }>(sql`select failure_code from native_test_support.messaging_restore_phases where id=${phaseIds[current.phase]} and cohort_id=${report.cohortId} and expected_branch=${copy.branch.name}`)).rows[0]);
            const code = reportedFailureCode ?? failureRow?.failure_code;
            throw new MessagingNodeHostFailure(typeof code === "string" ? code : "native_phase_failed");
          }
          assert.equal(observed.state, ADMISSION_NODE_RUN_STATE.completed);
          const row = await copy.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<StoredPhase>(sql`select state,work_runs,cipher_operations,checked_rejections,provider_requests,invitation_round_trip,runtime_version,source_commit,bundle_sha256 from native_test_support.messaging_restore_phases where id=${phaseIds[current.phase]} and cohort_id=${report.cohortId} and expected_branch=${copy.branch.name}`)).rows[0]);
          assert.ok(row && row.work_runs === 1 && row.source_commit === current.deployment.sourceCommit && row.bundle_sha256 === current.deployment.bundleSha256);
          const replay = await fetch(new URL(ADMISSION_NODE_HOST.runPath, current.deployment.hosts[0].url), { method: "POST", headers: { authorization: `${ADMISSION_NODE_HOST.tokenPrefix}${current.token}` }, redirect: "error", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
          report.requests.push({ phase: current.phase, method: "POST", stage: "known_completed_replay", status: replay.status });
          assert.equal(replay.status, 200);
          const replayStatus = admissionNodeStatusSchema.parse(await replay.json());
          assert.equal(replayStatus.operationId, phaseIds[current.phase]); assert.equal(replayStatus.state, ADMISSION_NODE_RUN_STATE.completed);
          const replayRow = await copy.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<StoredPhase>(sql`select state,work_runs,cipher_operations,checked_rejections,provider_requests,invitation_round_trip,runtime_version,source_commit,bundle_sha256 from native_test_support.messaging_restore_phases where id=${phaseIds[current.phase]} and cohort_id=${report.cohortId} and expected_branch=${copy.branch.name}`)).rows[0]);
          assert.deepEqual(replayRow, row);
          report.phases.push({ phase: current.phase, operationId: phaseIds[current.phase], slug: current.deployment.hosts[0].slug, sourceCommit: current.deployment.sourceCommit, bundleSha256: current.deployment.bundleSha256, observation: row });
          await persist();
        }
        try {
          await registerPhases(false);
          await start(PHASE.baseline, originalEnvironment); await executePhase();
          assert.ok(report.phases[0].observation.cipher_operations > 0 && report.phases[0].observation.invitation_round_trip);
          assert.equal((await readMessagingRestoreFacts(copy, source.context)).connection?.state, "disconnected");
          assert.deepEqual((await snapshot(copy)).memberships, [{ user_id: prepared.applied.context.userId, role: "tribemate", status: "active" }]);
          await start(PHASE.locked, lockedEnvironment);
          await copy.restoreFromParent();
          await registerPhases(true);
          assert.equal((await status("external_profile_after_restore")).state, ADMISSION_NODE_RUN_STATE.prepared);
          report.profileOutsideSqlSurvivedRestore = true;
          assert.deepEqual(await snapshot(copy), checkpoint); assert.deepEqual(await snapshot(parent), checkpoint);
          assert.deepEqual(await readMessagingRestoreFacts(copy, source.context), credentialCheckpoint);
          await executePhase(); assert.deepEqual(await snapshot(copy), checkpoint);
          await start(PHASE.lockedOriginal, originalLockedEnvironment); await executePhase(); assert.deepEqual(await snapshot(copy), checkpoint);
          await start(PHASE.epoch, epochEnvironment); await executePhase();
          const closed = await snapshot(copy);
          assert.deepEqual(closed.memberships, []); assert.deepEqual(closed.requests, checkpoint.requests); assert.deepEqual(closed.attempts, checkpoint.attempts); assert.deepEqual(closed.reservations, checkpoint.reservations);
          await start(PHASE.retiredKey, retiredKeyEnvironment); await executePhase();
          await start(PHASE.reconcile, lockedEnvironment); await executePhase();
          const reconciled = await snapshot(copy);
          assert.equal(reconciled.policy?.is_open, false); assert.equal(reconciled.policy?.requires_additional_verification, true);
          assert.deepEqual(reconciled.memberships, []); assert.deepEqual(reconciled.requests, checkpoint.requests); assert.deepEqual(reconciled.attempts, checkpoint.attempts); assert.deepEqual(reconciled.reservations, checkpoint.reservations);
          assert.equal(reconciled.policy?.verification_epoch, checkpoint.policy?.verification_epoch);
          const retiredFacts = await readMessagingRestoreFacts(copy, source.context);
          assert.equal(retiredFacts.connection?.state, "suspended"); assert.equal(retiredFacts.connection?.is_selected, true);
          for (const secret of retiredFacts.secret) { assert.ok(secret.retired_at); assert.ok(secret.purge_after); }
          for (const proofId of [prepared.applied.proofId, prepared.available.proofId]) assert.equal(reconciled.proofs.find((proof) => proof.id === proofId)?.status, "invalid");
          const historical = await readMessagingRestoreHistory(copy, history.cases);
          assert.deepEqual(historical.map((row) => [row.connection_id, row.version, row.last_activity_at]), historyCheckpoint.map((row) => [row.connection_id, row.version, row.last_activity_at]));
          for (const row of historical) {
            assert.equal(row.state, "suspended"); assert.equal(row.is_candidate, false); assert.equal(row.matching_secret_deadline, true); assert.equal(row.has_material, true); assert.equal(row.purged, false); assert.ok(row.retired_at);
            const candidate = history.cases.find((candidate) => candidate.connectionId === row.connection_id);
            assert.ok(candidate);
            if (candidate.candidateVersion === row.version && candidate.selectedVersion !== row.version) {
              assert.equal(row.no_idle_extension, true);
              if (candidate.name !== "fresh") { assert.equal(row.original_idle_cutoff, true); assert.equal(row.original_idle_purge, true); }
            }
          }
          await start(PHASE.reopen, reopenedEnvironment); await executePhase();
          const reopened = await snapshot(copy);
          assert.deepEqual(reopened.memberships, [{ user_id: prepared.queued.context.userId, role: "tribemate", status: "active" }]);
          assert.deepEqual(reopened.requests.find((request) => request.id === prepared.applied.requestId), checkpoint.requests.find((request) => request.id === prepared.applied.requestId));
          assert.deepEqual(reopened.deliveries.find((delivery) => delivery.id === prepared.uncertain.original.deliveryId), checkpoint.deliveries.find((delivery) => delivery.id === prepared.uncertain.original.deliveryId));
          const late = history.cases.find((candidate) => candidate.name === "late");
          const purged = (await readMessagingRestoreHistory(copy, history.cases)).find((row) => row.connection_id === late?.connectionId);
          assert.ok(purged && purged.has_material === false && purged.purged === true && purged.original_idle_cutoff === true && purged.original_idle_purge === true);
          assert.deepEqual(await snapshot(parent), checkpoint); assert.deepEqual(await readMessagingRestoreHistory(parent, history.cases), historyCheckpoint);
          report.originalRecordsPreserved = true;
          assert.equal(report.phases.length, Object.values(PHASE).length);
        } finally {
          await stop();
          for (const deployment of deployments) { await deployment.assertInputsUnchanged(); await deployment.assertPrivateMaterialAbsent(); }
          report.auditedReturnedDeployments = deployments.length;
          // A failed deployment has no returned capability; do not attest global coverage from successful returns alone.
          if (deployments.length === report.deploymentAttempts) {
            report.inputsStable = true; report.privateMaterialAbsent = true; report.functionsRemoved = true;
          }
        }
      });
    }, { databaseSelection: { databaseName: "neondb", roleName: "neondb_owner" }, computeUnits: MESSAGING_NATIVE_ACTIVATION.nativeComputeUnits });
    report.branchesRemoved = true;
    report.passed = true;
  } catch (error) { failure = error; }
  if (failure) report.failure = { stage: report.phase ?? "starting", ...summarizeMessagingNodeHostFailure(failure) };
  await persist();
  return report;
}
