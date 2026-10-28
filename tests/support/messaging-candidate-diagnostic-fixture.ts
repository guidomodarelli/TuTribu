/** Seeds authentic historical diagnostic material and safe ledger snapshots for exact candidate-version retirement. @module messaging-candidate-diagnostic-fixture */
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import type { CandidateExpirationCase } from "./messaging-candidate-expiration-fixture";
import { CANDIDATE_DIAGNOSTIC_HISTORY, CANDIDATE_DIAGNOSTIC_SCENARIOS } from "./constants/messaging-candidate-diagnostics";
import { createMessagingSecurityConfig, type MessagingKeyPurpose, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { createVerificationCodeMac } from "@/src/modules/academy-admissions/infrastructure/verification/verification-code-mac";
import { createVerificationCodeEnvelope } from "@/src/modules/messaging/infrastructure/encryption/verification-code-envelope";
import { createVerificationDeliveryPayloadMac } from "@/src/modules/messaging/infrastructure/encryption/verification-delivery-payload-mac";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { VERIFICATION_CODE_GENERATION, VERIFICATION_CHALLENGE_STATE  } from "@/src/modules/academy-admissions/constants/verification-challenge";
import { VERIFICATION_FROZEN_PAYLOAD_FORMAT } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { MESSAGE_DELIVERY_STATE, MESSAGE_ATTEMPT_STATE, MESSAGE_USAGE_CATEGORY, MESSAGE_RESERVATION_STATE, MESSAGE_RECEIPT_REASON } from "@/src/modules/messaging/constants/message-delivery";
import { CONNECTION_DIAGNOSTIC_OUTCOME } from "@/src/modules/messaging/constants/connection-diagnostic";
import { CODE_REQUEST_EVENT } from "@/src/modules/messaging/constants/code-request-budget";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";

/** Records only scope identifiers and observable expected transitions, never plaintext or cryptographic bytes. */
export type CandidateDiagnosticHistory = { challengeId: string; diagnosticId: string; deliveryId: string; connectionId: string; connectionVersion: number; scenario: "queued" | "verified" | "accepted" | "unknown" };

/** @param scenario - Historical diagnostic scenario. @returns The delivery state seeded for it; every scenario except `queued` has an attempt. */
function deliveryStateFor(scenario: CandidateDiagnosticHistory["scenario"]) {
  if (scenario === "unknown") return MESSAGE_DELIVERY_STATE.unknown;
  return scenario === "queued" ? MESSAGE_DELIVERY_STATE.queued : MESSAGE_DELIVERY_STATE.accepted;
}

/**
 * Inserts original dates and immutable payloads once, including coherent historical attempt/reservation records.
 * @param database - Exact owned disposable SQL branch.
 * @param userId - Historical canonical leader created before these resources.
 * @param resources - Exact existing resource versions to exercise, including a selected-version control.
 * @returns Safe identifiers and persisted snapshots; this seed does not claim that an SDK request occurred.
 */
export async function prepareCandidateDiagnosticHistory(database: AcademyAdmissionTestDatabase, userId: string, resources: Array<{ resource: CandidateExpirationCase; version: number }>) {
  const keyring = (purpose: MessagingKeyPurpose): MessagingKeyringInput => ({ activeKeyId: `${purpose}-diagnostic`, keys: [{ id: `${purpose}-diagnostic`, material: randomBytes(MESSAGING_CRYPTO.keyBytes) }] });
  const config = await createMessagingSecurityConfig({ environment: CANDIDATE_DIAGNOSTIC_HISTORY.environment, securityEpoch: CANDIDATE_DIAGNOSTIC_HISTORY.securityEpoch, recoveryLocked: false, keyrings: { credential: keyring(MESSAGING_KEY_PURPOSE.credential), otp_envelope: keyring(MESSAGING_KEY_PURPOSE.otpEnvelope), verification_mac: keyring(MESSAGING_KEY_PURPOSE.verificationMac), invitation_token: keyring(MESSAGING_KEY_PURPOSE.invitationToken), contact_fingerprint: keyring(MESSAGING_KEY_PURPOSE.contactFingerprint), operation_payload: keyring(MESSAGING_KEY_PURPOSE.operationPayload) } });
  const histories: CandidateDiagnosticHistory[] = [];
  try {
    await database.withContext({ userId, email: null }, async (transaction) => {
      for (const { resource, version } of resources) {
        const activity = (await transaction.execute<{ activity: Date | string }>(sql`select last_activity_at as activity from public.messaging_connection_versions where connection_id=${resource.connectionId} and tribe_id=${resource.tribeId} and version=${version}`)).rows[0];
        for (const scenario of CANDIDATE_DIAGNOSTIC_SCENARIOS) {
          const challengeId = randomUUID(), diagnosticId = randomUUID(), deliveryId = randomUUID(), envelopeId = randomUUID(), contactSubjectId = randomUUID();
          const createdAt = new Date(activity.activity), expiresAt = new Date(createdAt.getTime() + ADMISSION_LIMIT.verificationCodeValidityMs);
          const markerAt = new Date(createdAt.getTime() + CANDIDATE_DIAGNOSTIC_HISTORY.markerDelayMs), verifiedAt = scenario === "verified" ? new Date(createdAt.getTime() + CANDIDATE_DIAGNOSTIC_HISTORY.verificationDelayMs) : null;
          const scope: VerificationChallengeScope = { userId, tribeId: resource.tribeId, connectionId: resource.connectionId, connectionVersion: version, securityEpoch: config.securityEpoch, purpose: ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic, verificationEpoch: null, channel: "email", contact: { type: "email", value: `${challengeId}@example.test` } };
          const context = { ...scope, challengeId, createdAt, expiresAt }, code = randomInt(VERIFICATION_CODE_GENERATION.decimalRange).toString().padStart(ADMISSION_LIMIT.verificationCodeDigits, "0");
          const signed = await createVerificationCodeMac(config).sign(code, context), envelope = await createVerificationCodeEnvelope(config).seal(code, context, createdAt), fingerprint = await createAdmissionContactFingerprint(scope.contact, config);
          const frozenIntent = { format: VERIFICATION_FROZEN_PAYLOAD_FORMAT, challengeId, deliveryId, envelopeId, senderId: CANDIDATE_DIAGNOSTIC_HISTORY.senderId, templateId: null, templateLanguage: null, channel: scope.channel, purpose: scope.purpose };
          const payload = await createVerificationDeliveryPayloadMac(config).sign({ tribeId: resource.tribeId, connectionId: resource.connectionId, connectionVersion: version, challengeId, diagnosticId, deliveryId, contactSubjectId, fingerprintKeyId: fingerprint.keyId, contactFingerprint: fingerprint.digest, frozenIntent, createdAt, expiresAt });
          const hasAttempt = scenario !== "queued", deliveryState = deliveryStateFor(scenario);
          await transaction.execute(sql`insert into public.messaging_contact_budget_subjects(id,created_at) values (${contactSubjectId},${createdAt})`);
          await transaction.execute(sql`insert into public.messaging_contact_fingerprint_aliases(subject_id,fingerprint_key_id,contact_fingerprint,created_at) values (${contactSubjectId},${fingerprint.keyId},${Buffer.from(fingerprint.digest)},${createdAt})`);
          await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,contact_subject_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,state,queued_usage_policy_version,created_at,due_at,deadline_at) values (${deliveryId},${resource.tribeId},${resource.connectionId},${version},${config.environment},${config.securityEpoch},${scope.purpose},${diagnosticId},${userId},${contactSubjectId},${challengeId},${scope.channel},${randomUUID()},${Buffer.from(payload.mac)},${payload.keyId},${JSON.stringify(frozenIntent)}::jsonb,${deliveryState},${CANDIDATE_DIAGNOSTIC_HISTORY.usagePolicyVersion},${createdAt},${createdAt},${expiresAt})`);
          await transaction.execute(sql`insert into public.contact_verification_challenges(id,user_id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,purpose,verification_epoch,connection_id,connection_version,security_epoch,channel,state,created_at,expires_at,verified_at,code_mac,mac_key_id,code_envelope_id,delivery_id) values (${challengeId},${userId},${resource.tribeId},${scope.contact.type},${scope.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${scope.purpose},null,${resource.connectionId},${version},${config.securityEpoch},${scope.channel},${verifiedAt ? VERIFICATION_CHALLENGE_STATE.verified : VERIFICATION_CHALLENGE_STATE.issued},${createdAt},${expiresAt},${verifiedAt},${verifiedAt ? null : Buffer.from(signed.mac)},${signed.keyId},${verifiedAt ? null : envelopeId},${deliveryId})`);
          if (!verifiedAt) await transaction.execute(sql`insert into public.verification_code_envelopes(id,tribe_id,connection_id,connection_version,challenge_id,delivery_id,environment,security_epoch,key_id,iv,ciphertext,created_at,expires_at) values (${envelopeId},${resource.tribeId},${resource.connectionId},${version},${challengeId},${deliveryId},${config.environment},${config.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)},${createdAt},${expiresAt})`);
          await transaction.execute(sql`insert into public.messaging_connection_diagnostics(id,tribe_id,connection_id,connection_version,leader_user_id,challenge_id,channel,sender_id,outcome,created_at,validated_at) values (${diagnosticId},${resource.tribeId},${resource.connectionId},${version},${userId},${challengeId},${scope.channel},${CANDIDATE_DIAGNOSTIC_HISTORY.senderId},${verifiedAt ? CONNECTION_DIAGNOSTIC_OUTCOME.verified : CONNECTION_DIAGNOSTIC_OUTCOME.pending},${createdAt},${verifiedAt})`);
          await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,contact_subject_id,challenge_id,purpose,channel,event_type,operation_id,occurred_at) values (${resource.tribeId},${userId},${contactSubjectId},${challengeId},${scope.purpose},${scope.channel},${CODE_REQUEST_EVENT.diagnostic},${randomUUID()},${createdAt})`);
          if (hasAttempt) {
            const attemptId = randomUUID(), reservationId = randomUUID(), state = scenario === "unknown" ? MESSAGE_ATTEMPT_STATE.unknown : MESSAGE_ATTEMPT_STATE.accepted;
            await transaction.execute(sql`insert into public.message_delivery_attempts(id,delivery_id,tribe_id,connection_id,connection_version,sequence,reservation_id,lease_token,send_authorized_at,authorized_usage_policy_version,state,completed_at,safe_reason) values (${attemptId},${deliveryId},${resource.tribeId},${resource.connectionId},${version},1,${reservationId},${randomUUID()},${markerAt},${CANDIDATE_DIAGNOSTIC_HISTORY.usagePolicyVersion},${state},${markerAt},${scenario === "unknown" ? MESSAGE_RECEIPT_REASON.unknown : MESSAGE_RECEIPT_REASON.accepted})`);
            await transaction.execute(sql`insert into public.messaging_usage_reservations(id,tribe_id,attempt_id,delivery_id,category,state,reserved_at) values (${reservationId},${resource.tribeId},${attemptId},${deliveryId},${MESSAGE_USAGE_CATEGORY.verification},${MESSAGE_RESERVATION_STATE.consumed},${markerAt})`);
          }
          histories.push({ challengeId, diagnosticId, deliveryId, connectionId: resource.connectionId, connectionVersion: version, scenario });
        }
      }
    });
  } catch (error) {
    // Fixture SQL carries MAC/ciphertext parameters; failures must not expose those through the reporter.
    const cause = error instanceof Error && "cause" in error ? error.cause : error;
    const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" ? cause.code : CANDIDATE_DIAGNOSTIC_HISTORY.unavailableCode;
    throw new Error(`${CANDIDATE_DIAGNOSTIC_HISTORY.seedOperation} failed: postgres_code=${code}`);
  }
  /** @returns Only public lifecycle facts and original accounting identifiers/timestamps. */
  const snapshot = () => database.withContext({ userId, email: null }, async (transaction) => ({
    challenges: (await transaction.execute(sql`select id,state,version,is_current,verified_at::text,invalidated_at::text,invalidation_reason,code_mac is not null as has_mac,code_envelope_id is not null as has_envelope_reference from public.contact_verification_challenges where user_id=${userId} order by id`)).rows,
    diagnostics: (await transaction.execute(sql`select id,outcome,validated_at::text from public.messaging_connection_diagnostics where leader_user_id=${userId} order by id`)).rows,
    deliveries: (await transaction.execute(sql`select id,state,version,last_outcome,created_at::text,deadline_at::text from public.message_deliveries where actor_user_id=${userId} order by id`)).rows,
    attempts: (await transaction.execute(sql`select id,delivery_id,state,version,send_authorized_at::text,completed_at::text,authorized_usage_policy_version from public.message_delivery_attempts where delivery_id in (select id from public.message_deliveries where actor_user_id=${userId}) order by id`)).rows,
    reservations: (await transaction.execute(sql`select id,attempt_id,delivery_id,state,reserved_at::text,released_at::text,absence_evidence from public.messaging_usage_reservations where delivery_id in (select id from public.message_deliveries where actor_user_id=${userId}) order by id`)).rows,
    envelopes: (await transaction.execute(sql`select challenge_id from public.verification_code_envelopes where challenge_id in (select id from public.contact_verification_challenges where user_id=${userId}) order by challenge_id`)).rows,
    events: (await transaction.execute(sql`select id,tribe_id,contact_subject_id,challenge_id,occurred_at::text from public.messaging_usage_events where actor_user_id=${userId} order by id`)).rows,
  }));
  return { histories, snapshot };
}
