/** Exercises an explicit fresh connection, diagnostic, policy and admission after private recovery. @module messaging-restore-reopening-fixture */
import { randomUUID } from "node:crypto";
import { type MessagingRestoreSql, composeAdmissionRestoreOwnersForPrincipal , composeMessagingRestoreOwnersForPrincipal  } from "./messaging-restore-composition";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { prepareRestoreAdmissionCheckpoint } from "./messaging-restore-admission-fixture";
import { prepareMessagingActivationFromCreation, type MessagingActivationCreation } from "./messaging-activation-native";
import { composeRestoreAdmissionDispatch } from "./messaging-restore-dispatch-native";
import { createAdmissionProviderTransport } from "./admission-provider-transport";
import { PostgresMessagingConnectionRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-repository";
import { readAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-storage";
import type { MessagingConnectionCreationContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-management";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { VERIFICATION_MESSAGE_COPY } from "@/src/modules/messaging/constants/zavu-delivery";
import { ADMISSION_SOURCE_KIND } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { VERIFICATION_EMAIL_CHANNEL } from "@/src/modules/messaging/constants/verification-delivery";
import { MESSAGING_RESTORE_SAFETY_PHASE, type MessagingRestoreSafetyPhase } from "./constants/messaging-restore-safety";

/** Refers only to actual native setup; its captured source repositories are never invoked on the child. */
export type MessagingRestoreReopeningSource = { context: AuthorizedMessagingContext; fixture: { fixture: MessagingActivationCreation } };
export type MessagingRestoreReopeningApplicant = Pick<Awaited<ReturnType<typeof prepareRestoreAdmissionCheckpoint>>["queued"], "context" | "contact">;
type RestoreSource = MessagingRestoreReopeningSource;

/**
 * Prepares a different BYOK connection and verifies its diagnostic through the real SDK and closed HTTP.
 * @param database - Exact restored child, with no migration or original-parent capability.
 * @param source - Existing current synthetic leader/session, preserved by the checkpoint.
 * @param config - Explicit reconciled replacement external epoch and keyrings, now unlocked for preparation.
 * @returns New native resource/secret authority and its activated snapshot, held only in test memory.
 */
export async function prepareMessagingRestoreReplacement(database: MessagingRestoreSql, source: RestoreSource, config: MessagingSecurityConfig, readSecurityConfig: () => Promise<MessagingSecurityConfig> = async () => config) {
  const original = source.fixture.fixture;
  const execute = <Result>(_context: MessagingConnectionCreationContext, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext({ userId: original.context.actorUserId, email: null }, run);
  const existing = { ...original, fixture: { ...original.fixture, config }, execute, repository: new PostgresMessagingConnectionRepository(execute, readSecurityConfig) };
  const replacement = await prepareMessagingActivationFromCreation(database, existing, { initializeUsagePolicy: false, readSecurityConfig });
  const activated = await replacement.owner.activate(replacement.context, replacement.input);
  if (activated.state !== "completed") throw new Error("Messaging restore reopening failed: replacement_activation_unconfirmed");
  const resolved = await replacement.request.useCases.resolveContext.execute({ tribeId: replacement.context.tribeId, connectionId: replacement.context.connectionId, operation: REAUTHENTICATION_OPERATION.readMessagingSenders, requestId: randomUUID() });
  if (!resolved.allowed) throw new Error(`Messaging restore reopening failed: replacement_scope_${resolved.failure.code}`);
  const owners = composeMessagingRestoreOwnersForPrincipal(database, replacement.fixture.context, readSecurityConfig);
  // Readiness of the credential and diagnostic alone must not reopen the closed admission policy.
  const closedPolicy = await database.withContext({ userId: source.context.actorUserId, email: null }, (transaction) => readAdmissionPolicy(transaction, source.context.tribeId, false));
  if (!closedPolicy || closedPolicy.isOpen) throw new Error("Messaging restore reopening failed: policy_reopened_without_confirmation");
  const admission = composeAdmissionRestoreOwnersForPrincipal(database, original.context, readSecurityConfig);
  const updated = await admission.policy.update({ tribeId: source.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedVersion: closedPolicy.version, confirmed: true, patch: { isOpen: true } });
  if (!updated.ok || updated.value.state !== "completed") throw new Error("Messaging restore reopening failed: current_policy_update_unconfirmed");
  const policy = await admission.policy.activate({ tribeId: source.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedVersion: updated.value.result.version, confirmed: true });
  if (!policy.ok || policy.value.state !== "completed") throw new Error("Messaging restore reopening failed: current_policy_activation_unconfirmed");
  return { replacement, activated: activated.result, context: resolved.context, owners, admission, policy: policy.value.result, closedPolicy };
}

/**
 * Sends only to a closed native SDK transport, then uses its new local proof for one actual basic admission.
 * @param database - Current restored child after actual private reconciliation and reconnection.
 * @param source - Original current native leader and exact tribe.
 * @param prepared - Original applicants; one without a request is reused without resetting its history.
 * @param current - Actual freshly activated replacement and confirmed policy.
 * @param config - Current external replacement scope, never restored from SQL.
 * @param onPhase - Optional safe progress after each completed native stage.
 * @returns Safe committed outcomes and transport counters, without code/contact/credential values.
 */
export async function admitAfterMessagingRestore(database: MessagingRestoreSql, source: RestoreSource, prepared: { queued: MessagingRestoreReopeningApplicant }, current: Awaited<ReturnType<typeof prepareMessagingRestoreReplacement>>, config: MessagingSecurityConfig, onPhase?: (phase: MessagingRestoreSafetyPhase) => void, readSecurityConfig: () => Promise<MessagingSecurityConfig> = async () => config) {
  const applicant = prepared.queued;
  const issued = await current.admission.verification.issue({ ...applicant.context, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: current.policy.version, confirmed: true, contact: applicant.contact, channel: VERIFICATION_EMAIL_CHANNEL, admissionRequestId: null, source: { kind: ADMISSION_SOURCE_KIND.common } });
  if (issued.state !== "completed") throw new Error("Messaging restore reopening failed: fresh_issuance_unconfirmed");
  onPhase?.(MESSAGING_RESTORE_SAFETY_PHASE.freshChallengeIssued);
  let code = "";
  const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
    const body = await request.json() as { text: string };
    code = body.text.slice(VERIFICATION_MESSAGE_COPY.prefix.length, -VERIFICATION_MESSAGE_COPY.suffix.length);
    return Response.json({ message: { id: randomUUID(), direction: "outbound", channel: VERIFICATION_EMAIL_CHANNEL, status: "sent" } });
  } }]);
  const dispatch = await composeRestoreAdmissionDispatch(database, { ...source, context: current.context }, { context: applicant.context, original: issued.result }, readSecurityConfig, transport).run();
  if (dispatch.authorized !== 1 || dispatch.accepted !== 1 || dispatch.unknown !== 0) throw new Error("Messaging restore reopening failed: fresh_dispatch_unconfirmed");
  onPhase?.(MESSAGING_RESTORE_SAFETY_PHASE.freshDispatchCompleted);
  const verified = await current.admission.verification.verify({ ...applicant.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code });
  if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Messaging restore reopening failed: fresh_proof_unavailable");
  onPhase?.(MESSAGING_RESTORE_SAFETY_PHASE.freshProofConfirmed);
  const submitted = await current.admission.requests.submit({ ...applicant.context, type: "submit_admission", operationId: randomUUID(), expectedPolicyVersion: current.policy.version, confirmed: true, source: { kind: ADMISSION_SOURCE_KIND.common }, contact: applicant.contact, proofId: verified.result.proofId, message: null });
  if (submitted.state !== "completed" || !submitted.result.admissionRequestId || submitted.result.committedRequestVersion === null) throw new Error("Messaging restore reopening failed: fresh_request_unconfirmed");
  onPhase?.(MESSAGING_RESTORE_SAFETY_PHASE.freshRequestSubmitted);
  const decided = await current.admission.requests.decide({ userId: source.context.actorUserId, sessionId: source.context.sessionId, tribeId: source.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), type: "decide_admission_request", confirmed: true, admissionRequestId: submitted.result.admissionRequestId, expectedVersion: submitted.result.committedRequestVersion, decision: "approve", internalReason: "Revisión sintética tras recuperación", externalMessage: null });
  if (decided.state !== "completed" || decided.result.status !== "approved") throw new Error("Messaging restore reopening failed: fresh_decision_unconfirmed");
  onPhase?.(MESSAGING_RESTORE_SAFETY_PHASE.freshDecisionCompleted);
  return { dispatch, submitted, decided, receipts: transport.receipts.length, deniedRequests: transport.deniedRequests, proofId: verified.result.proofId };
}
