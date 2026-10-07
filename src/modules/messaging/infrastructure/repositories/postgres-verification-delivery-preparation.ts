/** Loads a protected original code/credential only for the exact committed live worker attempt. @module postgres-verification-delivery-preparation */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedDeliveryMessagingContext, MessagingSecretStore } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { PreparedVerificationDelivery, VerificationDeliveryPreparation } from "@/src/modules/messaging/infrastructure/zavu/verification-delivery-preparation";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { VERIFICATION_FROZEN_PAYLOAD_FORMAT } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { VERIFICATION_CHALLENGE_STATE } from "@/src/modules/academy-admissions/constants/verification-challenge";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { authorizeMessagingSecret, messagingSecretLifetimeIsCurrent } from "./postgres-messaging-secret-authorizer";
import { createVerificationDeliveryPayloadMac } from "@/src/modules/messaging/infrastructure/encryption/verification-delivery-payload-mac";
import { createVerificationCodeEnvelope } from "@/src/modules/messaging/infrastructure/encryption/verification-code-envelope";

/** Own guarded actor execution; no provider call happens while the returned callback is active. */
type PreparationDatabaseExecutor = <Result>(actorUserId: string, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Consumes only immutable delivery and challenge fields; no row schema is introduced. */
type PreparationRow = {
  frozen_intent: unknown; payload_fingerprint: Uint8Array; payload_mac_key_id: string; idempotency_key: string;
  contact_subject_id: string | null; recipient_country: string | null; source_resource_id: string; delivery_purpose: string;
  challenge_id: string; user_id: string; contact_type: "email" | "phone"; normalized_contact: string; fingerprint_key_id: string; contact_fingerprint: Uint8Array;
  purpose: VerificationChallengeScope["purpose"]; verification_epoch: number | null; channel: VerificationChallengeScope["channel"];
  created_at: string | Date; expires_at: string | Date; code_envelope_id: string | null; state: string; is_current: boolean; invalidated_at: string | Date | null;
  envelope_id: string; environment: string; security_epoch: string; format: number; key_id: string; iv: Uint8Array; ciphertext: Uint8Array;
};

/** Owns backend-only material preparation; it never verifies the user or posts a message. */
export class PostgresVerificationDeliveryPreparation implements VerificationDeliveryPreparation {
  /**
   * @param execute - Existing protected contributing-actor executor.
   * @param secrets - Worker-purpose SecretStore that independently revalidates actual attempt authority.
   * @param readSecurityConfig - Local external scope/keyring snapshot without outbound work under locks.
   */
  constructor(private readonly execute: PreparationDatabaseExecutor, private readonly secrets: MessagingSecretStore, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /**
   * Loads immutable payload and transient code after actual marker authority, then separately loads its credential.
   * @param context - Original committed worker attempt, independently checked against current rows.
   * @param signal - Original request deadline, checked around each protected asynchronous stage.
   * @returns Private prepared material only; no code/credential is projected to a public result.
   * @throws MessagingSecretAccessError for stale marker, crossed payload or changed current authority/security.
   */
  async prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedVerificationDelivery> {
    signal.throwIfAborted();
    const intent = await this.execute(context.contributingLeaderUserId, async (database) => {
      const authority = await authorizeMessagingSecret(database, context);
      signal.throwIfAborted();
      const row = (await database.execute<PreparationRow>(sql`select delivery.frozen_intent,delivery.payload_fingerprint,delivery.payload_mac_key_id,delivery.idempotency_key,delivery.contact_subject_id,delivery.recipient_country,delivery.source_resource_id,delivery.purpose as delivery_purpose,challenge.id as challenge_id,challenge.user_id,challenge.contact_type,challenge.normalized_contact,challenge.fingerprint_key_id,challenge.contact_fingerprint,challenge.purpose,challenge.verification_epoch,challenge.channel,challenge.created_at,challenge.expires_at,challenge.code_envelope_id,challenge.state,challenge.is_current,challenge.invalidated_at,envelope.id as envelope_id,envelope.environment,envelope.security_epoch,envelope.format,envelope.key_id,envelope.iv,envelope.ciphertext from public.message_deliveries delivery join public.contact_verification_challenges challenge on challenge.delivery_id=delivery.id and challenge.tribe_id=delivery.tribe_id join public.verification_code_envelopes envelope on envelope.id=challenge.code_envelope_id and envelope.challenge_id=challenge.id and envelope.delivery_id=delivery.id where delivery.id=${context.deliveryId} and delivery.tribe_id=${context.tribeId} and delivery.connection_id=${context.connectionId} and delivery.connection_version=${context.connectionVersion} for share of delivery,challenge,envelope`)).rows[0];
      if (!row || row.state !== VERIFICATION_CHALLENGE_STATE.issued || !row.is_current || row.invalidated_at !== null || row.delivery_purpose !== row.purpose || !row.contact_subject_id || row.code_envelope_id !== row.envelope_id || row.environment !== context.environment || row.security_epoch !== context.securityEpoch || typeof row.frozen_intent !== "object" || row.frozen_intent === null || Array.isArray(row.frozen_intent)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const frozen = row.frozen_intent as Record<string, unknown>;
      if (frozen.format !== VERIFICATION_FROZEN_PAYLOAD_FORMAT || frozen.challengeId !== row.challenge_id || frozen.deliveryId !== context.deliveryId || frozen.envelopeId !== row.envelope_id || frozen.channel !== row.channel || frozen.purpose !== row.purpose || typeof frozen.senderId !== "string" || !frozen.senderId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const config = await this.readSecurityConfig();
      if (config.recoveryLocked || config.environment !== context.environment || config.securityEpoch !== context.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
      const createdAt = new Date(row.created_at), expiresAt = new Date(row.expires_at);
      const diagnosticId = row.purpose === ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic ? row.source_resource_id : null;
      const matches = await createVerificationDeliveryPayloadMac(config).verify({ tribeId: context.tribeId, connectionId: context.connectionId, connectionVersion: context.connectionVersion, challengeId: row.challenge_id, diagnosticId, deliveryId: context.deliveryId, contactSubjectId: row.contact_subject_id, fingerprintKeyId: row.fingerprint_key_id, contactFingerprint: row.contact_fingerprint, frozenIntent: frozen, createdAt, expiresAt }, { keyId: row.payload_mac_key_id, mac: row.payload_fingerprint });
      if (!matches) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      if (row.contact_type === ADMISSION_CONTACT_TYPE.phone && !row.recipient_country) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const scope: VerificationChallengeScope = { userId: row.user_id, tribeId: context.tribeId, connectionId: context.connectionId, connectionVersion: context.connectionVersion, securityEpoch: context.securityEpoch, purpose: row.purpose, verificationEpoch: row.verification_epoch, channel: row.channel, contact: row.contact_type === ADMISSION_CONTACT_TYPE.email ? { type: ADMISSION_CONTACT_TYPE.email, value: row.normalized_contact } : { type: ADMISSION_CONTACT_TYPE.phone, value: row.normalized_contact, country: row.recipient_country! } };
      const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      if (!messagingSecretLifetimeIsCurrent(authority, now)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const code = await createVerificationCodeEnvelope(config).open({ format: row.format, purpose: MESSAGING_KEY_PURPOSE.otpEnvelope, environment: row.environment, securityEpoch: row.security_epoch, keyId: row.key_id, iv: row.iv, ciphertext: row.ciphertext }, { ...scope, challengeId: row.challenge_id, createdAt, expiresAt }, now);
      signal.throwIfAborted();
      const current = await authorizeMessagingSecret(database, context);
      const latest = await this.readSecurityConfig();
      const finalNow = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      if (!messagingSecretLifetimeIsCurrent(current, finalNow) || finalNow >= expiresAt || latest.recoveryLocked || latest.environment !== config.environment || latest.securityEpoch !== config.securityEpoch || !latest.keyrings[MESSAGING_KEY_PURPOSE.otpEnvelope].keys.has(row.key_id) || !latest.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].keys.has(row.payload_mac_key_id)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
      return { deliveryId: context.deliveryId, attemptId: context.attemptId, connectionId: context.connectionId, connectionVersion: context.connectionVersion, environment: context.environment, securityEpoch: context.securityEpoch, channel: row.channel, senderId: frozen.senderId, recipient: row.normalized_contact, code, idempotencyKey: row.idempotency_key, templateId: typeof frozen.templateId === "string" ? frozen.templateId : null, templateLanguage: typeof frozen.templateLanguage === "string" ? frozen.templateLanguage : null };
    });
    signal.throwIfAborted();
    const credential = await this.secrets.loadAuthorizedSecret(context);
    signal.throwIfAborted();
    // The credential read uses another short transaction; verify that the original code survived that gap.
    await this.execute(context.contributingLeaderUserId, async (database) => {
      const authority = await authorizeMessagingSecret(database, context);
      const current = (await database.execute<{ expires_at: string | Date; key_id: string; payload_mac_key_id: string }>(sql`select challenge.expires_at,envelope.key_id,delivery.payload_mac_key_id from public.message_deliveries delivery join public.contact_verification_challenges challenge on challenge.delivery_id=delivery.id and challenge.tribe_id=delivery.tribe_id join public.verification_code_envelopes envelope on envelope.id=challenge.code_envelope_id and envelope.challenge_id=challenge.id where delivery.id=${context.deliveryId} and delivery.tribe_id=${context.tribeId} and delivery.connection_id=${context.connectionId} and delivery.connection_version=${context.connectionVersion} and challenge.state=${VERIFICATION_CHALLENGE_STATE.issued} and challenge.is_current and challenge.invalidated_at is null for share of delivery,challenge,envelope`)).rows[0];
      const latest = await this.readSecurityConfig();
      const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      if (!current || !messagingSecretLifetimeIsCurrent(authority, now) || new Date(current.expires_at) <= now || latest.recoveryLocked || latest.environment !== context.environment || latest.securityEpoch !== context.securityEpoch || !latest.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(authority.keyId) || !latest.keyrings[MESSAGING_KEY_PURPOSE.otpEnvelope].keys.has(current.key_id) || !latest.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].keys.has(current.payload_mac_key_id)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    });
    signal.throwIfAborted();
    return { credential, intent };
  }
}
