/** Prepares actual policy, queued verification and local proof owners for a disposable restore checkpoint. @module messaging-restore-admission-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import type { MessagingRestoreSql, prepareMessagingRestoreSource } from "./messaging-restore-fixture";
import { refreshMessagingActivationRecency } from "./messaging-activation-fixture";
import { createAdmissionProviderTransport } from "./admission-provider-transport";
import { composeRestoreAdmissionDispatch } from "./messaging-restore-dispatch-fixture";
import { MESSAGING_RESTORE_APPLICANT_SESSION_LIFETIME_MS } from "./constants/messaging-restore-safety";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAdmissionActivationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activation-repository";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { PostgresAdmissionRequestRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-request-repository";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { createVerificationCodeEnvelope } from "@/src/modules/messaging/infrastructure/encryption/verification-code-envelope";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_SOURCE_KIND, ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { VERIFICATION_EMAIL_CHANNEL } from "@/src/modules/messaging/constants/verification-delivery";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { AdmissionChallengeIssuanceIntent, AdmissionVerificationAccountScope } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";

/** Refers to one actual native messaging selection without importing its captured executors into the child. */
type RestoreSource = Awaited<ReturnType<typeof prepareMessagingRestoreSource>>;

/** @param response - Actual application command result. @param operation - Safe current operation name. @returns Only a confirmed original snapshot. @throws For a closed or unresolved setup; never invents a successful fixture. */
function completed<Result>(response: { ok: false; failure: { code: string } } | { ok: true; value: AdmissionOperationResult<Result> }, operation: string): Result {
  if (!response.ok) throw new Error(`Messaging restore admission fixture ${operation} failed: ${response.failure.code}`);
  if (response.value.state !== "completed") throw new Error(`Messaging restore admission fixture ${operation} failed: original_unconfirmed`);
  return response.value.result;
}

/**
 * Composes policy and verification owners on the exact supplied SQL capability.
 * @param database - Current owned parent or restore child.
 * @param source - Original canonical leader's native session and fixed tribe.
 * @param readSecurityConfig - Current external recovery config, never a row from the checkpoint.
 * @returns Actual installed runtime, preflight, policy, request and verification owners.
 */
export function composeRestoreAdmissionOwners(database: MessagingRestoreSql, source: RestoreSource, readSecurityConfig: () => Promise<MessagingSecurityConfig>) {
  const principal = source.fixture.fixture.context;
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: principal.actorUserId, sessionId: principal.sessionId }), (_identity, run) => database.withContext({ userId: principal.actorUserId, email: null }, run));
  const admissions = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (_account, run) => database.withContext({ userId: principal.actorUserId, email: null }, run) });
  const runtime = admissions.createManualRequestModule({ readSecurityConfig }).runtime;
  const readRecoveryLock = async () => (await readSecurityConfig()).recoveryLocked;
  return {
    policy: admissions.createPolicyModule({ readSecurityConfig, composePreflight: (transaction, context) => new PostgresAdmissionActivationRepository(transaction, context, runtime, readRecoveryLock) }).useCases,
    preflight: admissions.createPreflightModule({ runtime, readRecoveryLock }).useCases,
    verification: new PostgresAdmissionContactVerificationOperations((scope, run) => database.withContext({ userId: scope.userId, email: null }, run), readSecurityConfig),
    requests: new PostgresAdmissionRequestRepository((scope, run) => database.withContext({ userId: scope.userId, email: null }, run), readSecurityConfig, (transaction) => ({ memberships: createAcademyApprovedMembershipWriter(transaction), notifications: createPostgresAdmissionNotificationObligationWriter(transaction) })),
  };
}

/**
 * Seeds only a current synthetic global identity; application operations create its challenge and proof.
 * @param database - Owned parent before its checkpoint is frozen.
 * @param tribeId - Existing actually prepared academy.
 * @returns Native current account/session and its normalized synthetic email input.
 */
async function seedRestoreApplicant(database: MessagingRestoreSql, tribeId: string) {
  const userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), email = `${userId}@example.test`;
  await database.withContext({ userId, email: null }, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic restore applicant',${email},false,${now},${now})`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},${new Date(now.getTime() + MESSAGING_RESTORE_APPLICANT_SESSION_LIFETIME_MS)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${userId},${accountId},${subject},${email})`);
  });
  const context: AdmissionVerificationAccountScope = { userId, sessionId, tribeId, requestId: randomUUID(), purpose: ADMISSION_VERIFICATION_PURPOSE.admission };
  return { context, contact: { type: ADMISSION_CONTACT_TYPE.email, value: email } };
}

/**
 * Opens only the newly created synthetic code before any restore or retirement.
 * @param database - Owned parent with the original current envelope.
 * @param config - Original external scope, kept in memory only.
 * @param scope - Immutable challenge context resolved from the native preparation.
 * @param challengeId - Actual issuance result.
 * @returns The code used immediately by the real verification owner, never recorded in an artifact.
 */
async function recoverRestoreSetupCode(database: MessagingRestoreSql, config: MessagingSecurityConfig, scope: VerificationChallengeScope, challengeId: string) {
  return database.withContext({ userId: scope.userId, email: null }, async (transaction) => {
    const row = (await transaction.execute<{ created_at: Date | string; expires_at: Date | string; environment: string; security_epoch: string; key_id: string; iv: Uint8Array; ciphertext: Uint8Array }>(sql`select challenge.created_at,challenge.expires_at,envelope.environment,envelope.security_epoch,envelope.key_id,envelope.iv,envelope.ciphertext from public.contact_verification_challenges challenge join public.verification_code_envelopes envelope on envelope.id=challenge.code_envelope_id where challenge.id=${challengeId} and challenge.user_id=${scope.userId} and challenge.tribe_id=${scope.tribeId}`)).rows[0];
    return createVerificationCodeEnvelope(config).open({ format: 1, purpose: MESSAGING_KEY_PURPOSE.otpEnvelope, environment: row.environment, securityEpoch: row.security_epoch, keyId: row.key_id, iv: row.iv, ciphertext: row.ciphertext }, { ...scope, challengeId, createdAt: new Date(row.created_at), expiresAt: new Date(row.expires_at) }, new Date());
  });
}

/**
 * Creates actual ON policy, applied proof, available proof and a separately queued challenge before copying.
 * @param database - Owned parent, still writable during preparation only.
 * @param source - Actual selected resource from native creation/diagnosis/activation.
 * @returns Native original IDs and safe input contexts; plaintext codes are not retained.
 */
export async function prepareRestoreAdmissionCheckpoint(database: AcademyAdmissionTestDatabase, source: RestoreSource) {
  const config = source.fixture.fixture.fixture.config;
  const tribeId = source.context.tribeId;
  for (const operation of [REAUTHENTICATION_OPERATION.updateAdmissionPolicy, REAUTHENTICATION_OPERATION.activateAdmissionPolicy, REAUTHENTICATION_OPERATION.pauseAdmissionPolicy]) {
    await refreshMessagingActivationRecency(database, source.fixture.fixture, operation, tribeId);
  }
  await database.withContext({ userId: source.context.actorUserId, email: null }, (transaction) => transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));
  const owners = composeRestoreAdmissionOwners(database, source, async () => config);
  const base = { tribeId, requestId: randomUUID(), confirmed: true as const };
  const initialized = completed(await owners.policy.initialize({ ...base, operationId: randomUUID() }), REAUTHENTICATION_OPERATION.updateAdmissionPolicy);
  const configured = completed(await owners.policy.update({ ...base, operationId: randomUUID(), expectedVersion: initialized.version, patch: { isOpen: true, requiresAdditionalVerification: true, messagingConnectionId: source.context.connectionId, messagingConnectionVersion: source.context.connectionVersion } }), REAUTHENTICATION_OPERATION.updateAdmissionPolicy);
  const activated = completed(await owners.policy.activate({ ...base, operationId: randomUUID(), expectedVersion: configured.version }), REAUTHENTICATION_OPERATION.activateAdmissionPolicy);
  const applied = await seedRestoreApplicant(database, tribeId), available = await seedRestoreApplicant(database, tribeId), queued = await seedRestoreApplicant(database, tribeId), uncertain = await seedRestoreApplicant(database, tribeId);
  /** @param applicant - Current synthetic account and normalized contact. @returns A genuinely queued original challenge without dispatch. */
  const issue = async (applicant: typeof applied) => {
    const input: AdmissionChallengeIssuanceIntent = { ...applicant.context, operationId: randomUUID(), expectedPolicyVersion: activated.version, confirmed: true, contact: applicant.contact, channel: VERIFICATION_EMAIL_CHANNEL, admissionRequestId: null, source: { kind: ADMISSION_SOURCE_KIND.common } };
    const issued = await owners.verification.issue(input);
    if (issued.state !== "completed") throw new Error("Messaging restore admission fixture issue failed: original_unconfirmed");
    return { ...applicant, input, original: issued.result };
  };
  /** @param applicant - Actual queued issuance. @returns An authentic available proof, using the original native AES code and local verifier. */
  const verify = async (applicant: Awaited<ReturnType<typeof issue>>) => {
    const scope: VerificationChallengeScope = { userId: applicant.context.userId, tribeId, connectionId: source.context.connectionId, connectionVersion: source.context.connectionVersion, securityEpoch: config.securityEpoch, purpose: ADMISSION_VERIFICATION_PURPOSE.admission, verificationEpoch: activated.verificationEpoch, channel: VERIFICATION_EMAIL_CHANNEL, contact: applicant.contact };
    const verificationCode = await recoverRestoreSetupCode(database, config, scope, applicant.original.challengeId);
    const verified = await owners.verification.verify({ ...applicant.context, operationId: randomUUID(), challengeId: applicant.original.challengeId, verificationCode });
    if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Messaging restore admission fixture verify failed: proof_unavailable");
    return { ...applicant, proofId: verified.result.proofId, applyBefore: verified.result.applyBefore };
  };
  const appliedProof = await verify(await issue(applied));
  const submitted = await owners.requests.submit({ ...applied.context, type: "submit_admission", operationId: randomUUID(), expectedPolicyVersion: activated.version, confirmed: true, source: { kind: ADMISSION_SOURCE_KIND.common }, contact: applied.contact, proofId: appliedProof.proofId, message: null });
  if (submitted.state !== "completed" || !submitted.result.admissionRequestId || submitted.result.outcome !== "pending") throw new Error("Messaging restore admission fixture submit failed: original_pending_unavailable");
  if (submitted.result.committedRequestVersion === null) throw new Error("Messaging restore admission fixture submit failed: original_version_unavailable");
  const uncertainIssuance = await issue(uncertain);
  const uncertainTransport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: () => { throw new TypeError("Synthetic original delivery response loss"); } }]);
  const uncertainOutcome = await composeRestoreAdmissionDispatch(database, source, uncertainIssuance, async () => config, uncertainTransport).run();
  if (uncertainOutcome.authorized !== 1 || uncertainOutcome.unknown !== 1 || uncertainTransport.receipts.length !== 1 || uncertainTransport.deniedRequests !== 0) throw new Error("Messaging restore admission fixture dispatch failed: original_unknown_unconfirmed");
  const availableProof = await verify(await issue(available)), queuedIssuance = await issue(queued);
  const queuedScope: VerificationChallengeScope = { userId: queued.context.userId, tribeId, connectionId: source.context.connectionId, connectionVersion: source.context.connectionVersion, securityEpoch: config.securityEpoch, purpose: ADMISSION_VERIFICATION_PURPOSE.admission, verificationEpoch: activated.verificationEpoch, channel: VERIFICATION_EMAIL_CHANNEL, contact: queued.contact };
  const queuedVerificationCode = await recoverRestoreSetupCode(database, config, queuedScope, queuedIssuance.original.challengeId);
  return { owners, policy: activated, applied: { ...appliedProof, requestId: submitted.result.admissionRequestId, requestVersion: submitted.result.committedRequestVersion }, available: availableProof, queued: queuedIssuance, queuedVerificationCode, uncertain: uncertainIssuance };
}

/**
 * Reads original proof/outbox/accounting facts without plaintext contacts, code material or credentials.
 * @param database - Exact owned checkpoint or restored copy.
 * @param tribeId - Canonical synthetic academy.
 * @param applicants - Only the synthetic accounts created by this scenario.
 * @returns Safe observable resource history and counts, never authority for a later mutation.
 */
export function readRestoreAdmissionFacts(database: MessagingRestoreSql, tribeId: string, applicants: readonly string[]) {
  return database.withContext({ userId: null, email: null }, async (transaction) => ({
    policy: (await transaction.execute(sql`select version,verification_epoch,is_open,requires_additional_verification,messaging_connection_id,messaging_connection_version,activated_at from public.academy_admission_policies where tribe_id=${tribeId}`)).rows[0],
    requests: (await transaction.execute(sql`select id,user_id,status,version,proof_id,submitted_at,expires_at from public.academy_admission_requests where tribe_id=${tribeId} order by id`)).rows,
    proofs: (await transaction.execute(sql`select id,status,verification_epoch,security_epoch,applied_request_id,apply_before,invalidated_at,invalidation_reason from public.academy_admission_verification_proofs where tribe_id=${tribeId} order by id`)).rows,
    challenges: (await transaction.execute(sql`select id,user_id,state,is_current,verification_epoch,security_epoch,expires_at,delivery_id,invalidated_at from public.contact_verification_challenges where tribe_id=${tribeId} order by id`)).rows,
    deliveries: (await transaction.execute(sql`select id,source_resource_id,state,connection_id,connection_version,security_epoch from public.message_deliveries where tribe_id=${tribeId} order by id`)).rows,
    attempts: (await transaction.execute(sql`select id,delivery_id,state,reservation_id,connection_id,connection_version from public.message_delivery_attempts where tribe_id=${tribeId} order by id`)).rows,
    reservations: (await transaction.execute(sql`select id,delivery_id,attempt_id,state,reserved_at,released_at from public.messaging_usage_reservations where tribe_id=${tribeId} order by id`)).rows,
    memberships: (await transaction.execute(sql`select user_id,role,status from public.tribe_members where tribe_id=${tribeId} and user_id=any(${sql.param(applicants)}::text[]) order by user_id`)).rows,
  }));
}
