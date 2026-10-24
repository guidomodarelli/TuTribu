/** Executes the fixed restore protocol through actual owners on the supplied host SQL capability. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { buildMessagingRecoveryModule } from "@/src/modules/messaging/setup";
import type { MessagingRecoveryResult } from "@/src/modules/messaging/domain/repositories/messaging-recovery";
import { PostgresMessagingConnectionRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-repository";
import { PostgresSecretMaterialMaintenance } from "@/src/modules/messaging/infrastructure/repositories/postgres-secret-material-maintenance";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { createPersonalInvitationTokenCodec } from "@/src/modules/academy-admissions/infrastructure/tokens/personal-invitation-token";
import { readAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-storage";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { composeAdmissionRestoreOwnersForPrincipal, composeMessagingRestoreOwnersForPrincipal } from "./messaging-restore-composition";
import { composeRestoreAdmissionDispatch } from "./messaging-restore-dispatch-native";
import { prepareMessagingRestoreReplacement, admitAfterMessagingRestore } from "./messaging-restore-reopening-native";
import { readMessagingRestoreFacts, readMessagingRestoreHistory, readRestoreAdmissionFacts } from "./messaging-restore-observations-native";
import { createAdmissionProviderTransport } from "./admission-provider-transport";
import { observeMessagingNativeCipher } from "./observe-messaging-native-cipher";
import type { MessagingRestoreNodeDatabase } from "./messaging-restore-node-database";
import { MESSAGING_RESTORE_NODE_HOST as HOST, MESSAGING_RESTORE_NODE_PHASE as PHASE, type MessagingRestoreNodeInput } from "./constants/messaging-restore-node-host";

/** Contains only counters and booleans; no identity, credential, code, token or external control value. */
export type MessagingRestoreNodePhaseObservation = { cipherOperations: number; checkedRejections: number; providerRequests: number; invitationRoundTrip: boolean };

/** @param condition - Actual native result. @param detail - Fixed diagnostic label. @returns Only after the required condition held. */
function requireCondition(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`MessagingRestoreNodePhase.verify failed: ${detail}`);
}

/** @param operation - Actual guarded owner call. @param expectedCode - Its public failure contract. @returns The original rejection for private cause checks; never plaintext success. */
async function requireDenied(operation: Promise<unknown>, expectedCode: string): Promise<unknown> {
  try { await operation; }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === expectedCode) return error;
    throw new Error(`MessagingRestoreNodePhase.reject failed: expected_${expectedCode}`, { cause: error });
  }
  throw new Error(`MessagingRestoreNodePhase.reject failed: unauthorized_success_${expectedCode}`);
}

/** @param config - Actual current host settings. @param input - Fixed outside-SQL controller DTO. @returns After the intended live profile and key inventory were verified. */
export function assertMessagingRestoreNodeProfile(config: MessagingSecurityConfig, input: MessagingRestoreNodeInput): void {
  requireCondition(config.environment === input.expected.environment && config.securityEpoch === input.expected.securityEpoch && config.recoveryLocked === input.expected.recoveryLocked, "external_profile_mismatch");
  for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) {
    const ring = config.keyrings[purpose], originalId = input.source.originalKeyIds[purpose];
    const originalActive = input.phase === PHASE.baseline || input.phase === PHASE.lockedOriginal || input.phase === PHASE.epoch;
    const retainOriginal = originalActive || input.phase === PHASE.reopen && purpose !== MESSAGING_KEY_PURPOSE.credential;
    requireCondition((ring.activeKeyId === originalId) === originalActive && ring.keys.has(originalId) === retainOriginal, "external_key_inventory_mismatch");
  }
}

/** @param input - Original prepared synthetic cohort. @returns The exact old approval, never an account chosen by an HTTP caller. */
function originalApproval(input: MessagingRestoreNodeInput) {
  const source = input.source, context = source.context;
  return { userId: context.actorUserId, sessionId: context.sessionId, tribeId: context.tribeId, requestId: randomUUID(), operationId: randomUUID(), type: "decide_admission_request" as const, confirmed: true as const, admissionRequestId: source.applied.requestId, expectedVersion: source.applied.requestVersion, decision: "approve" as const, internalReason: "Revisión sintética de recuperación", externalMessage: null };
}

/** @param input - Original available proof. @returns Its original namespace with a fresh explicit operation only. */
function originalSubmission(input: MessagingRestoreNodeInput) {
  const source = input.source;
  return { ...source.available.context, operationId: randomUUID(), type: "submit_admission" as const, confirmed: true as const, expectedPolicyVersion: source.policyVersion, source: { kind: "common" as const }, contact: source.available.contact, proofId: source.available.proofId, message: null };
}

/**
 * @param database - Exact injected branch, with only its copied ordinary-role option.
 * @param input - Validated server environment DTO; never request data.
 * @param readSecurityConfig - Current external host settings at every protected boundary.
 * @returns Native counters only after all requirements of this fixed phase passed.
 */
export async function runMessagingRestoreNodePhase(database: MessagingRestoreNodeDatabase, input: MessagingRestoreNodeInput, readSecurityConfig: () => Promise<MessagingSecurityConfig>): Promise<MessagingRestoreNodePhaseObservation> {
  const source = input.source, context = source.context;
  const config = await readSecurityConfig();
  assertMessagingRestoreNodeProfile(config, input);
  const principal = source.creationContext;
  const messaging = composeMessagingRestoreOwnersForPrincipal(database, principal, readSecurityConfig);
  const admission = composeAdmissionRestoreOwnersForPrincipal(database, principal, readSecurityConfig);
  const execute = <Result>(_context: unknown, run: Parameters<typeof database.withContext<Result>>[1]) => database.withContext({ userId: context.actorUserId, email: null }, run);
  const creation = { fixture: { userId: context.actorUserId, own: { userId: context.actorUserId, email: source.ownEmail }, config }, context: source.creationContext, execute, repository: new PostgresMessagingConnectionRepository(execute, readSecurityConfig) };
  const reopeningSource = { context, fixture: { fixture: creation } };
  const result: MessagingRestoreNodePhaseObservation = { cipherOperations: 0, checkedRejections: 0, providerRequests: 0, invitationRoundTrip: false };

  if (input.phase === PHASE.baseline) {
    const observed = await observeMessagingNativeCipher(() => messaging.secrets.loadAuthorizedSecret(context));
    requireCondition(observed.value === source.originalCredential && observed.cipherOperations > 0, "original_secret_not_live_or_observer_uncalibrated");
    result.cipherOperations = observed.cipherOperations;
    const invitationContext = { tribeId: context.tribeId, invitationId: randomUUID() }, codec = createPersonalInvitationTokenCodec(config);
    const issued = await codec.issue(invitationContext);
    const reference = { ...invitationContext, keyId: issued.keyId, digest: issued.digest, lookupDigest: issued.lookupDigest };
    requireCondition(await codec.verify(issued.token, reference) && !await codec.verify(issued.token, { ...reference, invitationId: randomUUID() }), "native_invitation_key_not_verified");
    result.invitationRoundTrip = true;
    const preflight = await admission.preflight.execute({ tribeId: context.tribeId, requestId: randomUUID() });
    requireCondition(preflight.ok && preflight.value.prepared, "original_policy_not_prepared");
    const approved = await admission.requests.decide(originalApproval(input));
    requireCondition(approved.state === "completed" && approved.result.status === "approved", "original_proof_not_admissible");
    const paused = await admission.policy.update({ tribeId: context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedVersion: source.policyVersion, confirmed: true, patch: { isOpen: false, requiresAdditionalVerification: false } });
    requireCondition(paused.ok && paused.value.state === "completed", "original_pause_unconfirmed");
    const disconnected = await messaging.disconnection.disconnect(source.retirementContext, { operationId: randomUUID(), expectedVersion: source.activatedVersion, confirmed: true });
    requireCondition(disconnected.state === "completed" && disconnected.result.state === "disconnected", "original_retirement_unconfirmed");
    await requireDenied(messaging.secrets.loadAuthorizedSecret(context), "resource_unavailable");
    result.checkedRejections = 1;
    return result;
  }

  if (input.phase === PHASE.locked || input.phase === PHASE.lockedOriginal || input.phase === PHASE.epoch || input.phase === PHASE.retiredKey) {
    const transport = createAdmissionProviderTransport([]);
    const observed = await observeMessagingNativeCipher(async () => {
      await requireDenied(messaging.secrets.loadAuthorizedSecret(context), "connection_incomplete");
      result.checkedRejections += 1;
      await requireDenied(messaging.activation.activate(source.activationContext, { operationId: randomUUID(), expectedVersion: source.activatedVersion, confirmed: true }), "connection_incomplete");
      result.checkedRejections += 1;
      if (input.phase === PHASE.retiredKey) return;
      requireCondition(Date.now() < source.available.applyBefore.getTime() && Date.now() < source.queued.expiresAt.getTime(), "original_live_proof_or_code_expired");
      const preflight = await admission.preflight.execute({ tribeId: context.tribeId, requestId: randomUUID() });
      // This inventory preview does not evaluate transport readiness or the connection's epoch.
      requireCondition(preflight.ok && preflight.value.prepared === !config.recoveryLocked, "restored_inventory_lock_contract_failed");
      if (input.phase === PHASE.locked || input.phase === PHASE.lockedOriginal) {
        await requireDenied(admission.requests.decide(originalApproval(input)), "resource_unavailable");
        await requireDenied(admission.requests.submit(originalSubmission(input)), "resource_unavailable");
        await requireDenied(admission.verification.verify({ ...source.queued.context, operationId: randomUUID(), challengeId: source.queued.original.challengeId, verificationCode: source.queued.code }), "resource_unavailable");
        result.checkedRejections += 3;
      } else {
        const verified = await admission.verification.verify({ ...source.queued.context, operationId: randomUUID(), challengeId: source.queued.original.challengeId, verificationCode: source.queued.code });
        requireCondition(verified.state === "completed" && verified.result.result === "denied" && verified.result.code === "challenge_invalidated", "old_code_not_invalidated_by_epoch");
        await requireDenied(admission.requests.decide(originalApproval(input)), "proof_unavailable");
        await requireDenied(admission.requests.submit(originalSubmission(input)), "additional_verification_required");
        result.checkedRejections += 3;
      }
      const dispatched = await composeRestoreAdmissionDispatch(database, { context }, source.queued, readSecurityConfig, transport).run();
      requireCondition(dispatched.authorized === 0 && dispatched.accepted === 0 && dispatched.delivered === 0 && dispatched.unknown === 0 && transport.receipts.length === 0 && transport.deniedRequests === 0, "restored_outbox_dispatched");
    });
    requireCondition(observed.cipherOperations === 0, "cipher_work_before_closed_guard");
    result.cipherOperations = observed.cipherOperations;
    return result;
  }

  if (input.phase === PHASE.reconcile) {
    const observed = await observeMessagingNativeCipher(async () => {
      const role = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ bypass: boolean; superuser: boolean }>(sql`select rolbypassrls as bypass,rolsuper as superuser from pg_roles where rolname=${source.nonBypassRoleName}`)).rows[0]);
      requireCondition(role?.bypass === false && role.superuser === false, "ordinary_role_privilege_unproven");
      const dependencies = { authorize: async () => true, readSecurityFacts: async () => { const current = await readSecurityConfig(); return { environment: current.environment, securityEpoch: current.securityEpoch, recoveryLocked: current.recoveryLocked }; } };
      const recoveryInput = { tribeId: context.tribeId, environment: config.environment, securityEpoch: config.securityEpoch, sourceSecurityEpoch: context.securityEpoch, limit: HOST.recoveryBatchLimit };
      const ordinary = buildMessagingRecoveryModule({ ...dependencies, execute: (run) => database.withContext({ userId: null, email: null }, run, "non_bypass") }).useCases.reconcileRecovery;
      await requireDenied(ordinary.execute(recoveryInput), "permission_denied");
      let directDenied = false;
      try { await database.withContext({ userId: null, email: null }, (transaction) => transaction.execute(sql`select public.claim_messaging_recovery_scope(${context.tribeId})`), "non_bypass"); }
      catch (error) { directDenied = Boolean(error && typeof error === "object" && "cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause && error.cause.code === "42501"); }
      requireCondition(directDenied, "ordinary_role_claim_was_not_denied");
      result.checkedRejections += 2;
      const recovery = buildMessagingRecoveryModule({ ...dependencies, execute: (run) => database.withContext({ userId: null, email: null }, run) }).useCases.reconcileRecovery;
      requireCondition((await recovery.inspect(recoveryInput)).remaining, "recovery_original_work_missing");
      const beforeRecovery = await readMessagingRestoreFacts(database, context);
      let committedValue: unknown, executions = 0;
      const responseLoss = new Error("Synthetic private recovery response lost");
      const lost = buildMessagingRecoveryModule({ ...dependencies, execute: async (run) => { executions += 1; committedValue = await database.withContext({ userId: null, email: null }, run); throw responseLoss; } }).useCases.reconcileRecovery;
      const lostError = await requireDenied(lost.execute(recoveryInput), "operation_unresolved");
      const committed = committedValue as MessagingRecoveryResult | undefined;
      requireCondition(executions === 1 && committed?.policyClosed && committed.connectionsSuspended === 1 && committed.remaining && lostError && typeof lostError === "object" && "cause" in lostError && lostError.cause === responseLoss, "recovery_lost_response_contract_failed");
      requireCondition((await recovery.inspect(recoveryInput)).remaining, "recovery_inspection_after_loss_failed");
      const originalFacts = await readMessagingRestoreFacts(database, context), admissionFacts = await readRestoreAdmissionFacts(database, context.tribeId, [source.applied.context.userId, source.available.context.userId, source.queued.context.userId]);
      const maximumBatches = admissionFacts.challenges.length + admissionFacts.proofs.length + originalFacts.secret.length;
      const batches: MessagingRecoveryResult[] = [committed];
      for (let batchIndex = 1; batches.at(-1)!.remaining && batchIndex < maximumBatches; batchIndex += 1) batches.push(await recovery.execute(recoveryInput));
      requireCondition(batches.at(-1)?.remaining === false && batches.reduce((count, batch) => count + Number(batch.policyClosed), 0) === 1 && !(await recovery.inspect(recoveryInput)).remaining, "recovery_did_not_finish");
      requireCondition(batches.reduce((count, batch) => count + batch.versionsRetired, 0) === beforeRecovery.versions.filter((version) => version.retired_at === null).length && batches.reduce((count, batch) => count + batch.secretsRetired, 0) === beforeRecovery.secret.filter((secret) => secret.retired_at === null).length, "recovery_retirement_counts_incomplete");
      for (const batch of batches) for (const count of [batch.connectionsSuspended, batch.candidateSlotsReleased, batch.versionsRetired, batch.secretsRetired, batch.proofsInvalidated, batch.challengesInvalidated, batch.queuedDeliveriesCancelled]) requireCondition(count <= HOST.recoveryBatchLimit, "recovery_batch_bound_exceeded");
      const empty = await recovery.execute(recoveryInput);
      requireCondition(!empty.remaining && !empty.policyClosed && [empty.connectionsSuspended, empty.candidateSlotsReleased, empty.versionsRetired, empty.secretsRetired, empty.proofsInvalidated, empty.challengesInvalidated, empty.queuedDeliveriesCancelled].every((count) => count === 0), "recovery_noop_changed_state");
      for (const candidate of source.history) {
        const inputForHistory = { ...recoveryInput, tribeId: candidate.tribeId }, historyRows = await readMessagingRestoreHistory(database, [candidate]);
        let current = await recovery.execute(inputForHistory);
        for (let batchIndex = 1; current.remaining && batchIndex < historyRows.length + 1; batchIndex += 1) current = await recovery.execute(inputForHistory);
        requireCondition(!current.remaining && !(await recovery.inspect(inputForHistory)).remaining, "historical_recovery_unfinished");
      }
    });
    requireCondition(observed.cipherOperations === 0, "cipher_work_during_reconciliation");
    return result;
  }

  requireCondition(input.phase === PHASE.reopen, "unsupported_phase");
  await database.withContext({ userId: null, email: null }, async (transaction) => {
    await registerMessagingPrivateMacKeyMaterial(transaction, config, MESSAGING_KEY_PURPOSE.operationPayload);
    await registerMessagingPrivateMacKeyMaterial(transaction, config, MESSAGING_KEY_PURPOSE.contactFingerprint);
  });
  requireCondition(await new PostgresSecretMaterialMaintenance((run) => database.withContext({ userId: null, email: null }, run), async () => !(await readSecurityConfig()).recoveryLocked).purgeRetired(1) === 1, "historical_purge_unconfirmed");
  const manualPolicy = await database.withContext({ userId: null, email: null }, (transaction) => readAdmissionPolicy(transaction, source.manualTribeId, false));
  requireCondition(manualPolicy && !manualPolicy.isOpen && !manualPolicy.requiresAdditionalVerification, "manual_policy_not_closed");
  await requireDenied(admission.requests.submit({ ...originalSubmission(input), ...source.queued.context, tribeId: source.manualTribeId, expectedPolicyVersion: manualPolicy.version, proofId: null, contact: source.queued.contact }), "admission_ineligible");
  const manualEffects = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ requests: number; basic_members: number }>(sql`select (select count(*)::integer from public.academy_admission_requests where tribe_id=${source.manualTribeId}) as requests,(select count(*)::integer from public.tribe_members where tribe_id=${source.manualTribeId} and role='tribemate') as basic_members`)).rows[0]);
  requireCondition(manualEffects.requests === 0 && manualEffects.basic_members === 0, "manual_policy_admitted_after_recovery");
  result.checkedRejections += 1;
  const replacement = await prepareMessagingRestoreReplacement(database, reopeningSource, config, readSecurityConfig);
  requireCondition(replacement.context.connectionId !== context.connectionId && !replacement.closedPolicy.isOpen, "replacement_not_explicit");
  const opened = await observeMessagingNativeCipher(() => replacement.owners.secrets.loadAuthorizedSecret(replacement.context));
  requireCondition(opened.value === replacement.replacement.credential && opened.cipherOperations > 0, "replacement_secret_or_observer_unavailable");
  result.cipherOperations = opened.cipherOperations;
  const oldAccess = await observeMessagingNativeCipher(() => requireDenied(messaging.secrets.loadAuthorizedSecret(context), "resource_unavailable"));
  requireCondition(oldAccess.cipherOperations === 0, "retired_secret_used_after_reopening");
  result.checkedRejections += 1;
  const preflight = await replacement.admission.preflight.execute({ tribeId: context.tribeId, requestId: randomUUID() });
  requireCondition(preflight.ok && preflight.value.prepared, "replacement_policy_not_prepared");
  const fresh = await admitAfterMessagingRestore(database, reopeningSource, { queued: source.queued }, replacement, config, undefined, readSecurityConfig);
  requireCondition(fresh.dispatch.authorized === 1 && fresh.dispatch.accepted === 1 && fresh.dispatch.unknown === 0 && fresh.receipts === 1 && fresh.deniedRequests === 0 && ![source.applied.proofId, source.available.proofId].includes(fresh.proofId), "fresh_admission_unconfirmed");
  result.providerRequests = replacement.replacement.transport.receipts.length + fresh.receipts;
  return result;
}
