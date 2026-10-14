/** Seeds a real signed verification pipeline and independent credential lifetimes under the full current schema. @module messaging-protection-key-rotation-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareVerificationDeliveryPipeline } from "./verification-delivery-pipeline-fixture";
import { seedMessagingCandidateExpiration } from "./messaging-candidate-expiration-fixture";
import type { MessagingSecurityConfig, MessagingKeyring } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { MessagingKeyPurpose } from "@/src/modules/messaging/domain/value-objects/messaging-key-purpose";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";

/** @param original - Original synthetic nonextractable keys. @returns An independent retained successor for all six purposes, without changing deployment identity. */
async function retainedSuccessor(original: MessagingSecurityConfig): Promise<MessagingSecurityConfig> {
  /** @param purpose - Exact independent purpose. @returns New active material while deliberately retaining the original key. */
  const rotate = async (purpose: MessagingKeyPurpose): Promise<MessagingKeyring> => {
    const id = randomUUID(), material = randomBytes(MESSAGING_CRYPTO.keyBytes);
    try {
      const cipher = purpose === MESSAGING_KEY_PURPOSE.credential || purpose === MESSAGING_KEY_PURPOSE.otpEnvelope;
      const key = await crypto.subtle.importKey("raw", material, cipher ? { name: MESSAGING_CRYPTO.aesAlgorithm } : { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, cipher ? ["encrypt", "decrypt"] : ["sign", "verify"]);
      return { purpose, activeKeyId: id, keys: new Map([...original.keyrings[purpose].keys, [id, key]]) };
    } finally { material.fill(0); }
  };
  return { ...original, keyrings: { credential: await rotate("credential"), otp_envelope: await rotate("otp_envelope"), verification_mac: await rotate("verification_mac"), invitation_token: await rotate("invitation_token"), contact_fingerprint: await rotate("contact_fingerprint"), operation_payload: await rotate("operation_payload") } };
}

/** @param database - Exact owned branch. @returns Native pipeline, original/retained configurations and safe lifecycle snapshots without caching API-key plaintext. */
export async function prepareMessagingProtectionKeyRotation(database: AcademyAdmissionTestDatabase) {
  const pipeline = await prepareVerificationDeliveryPipeline(database);
  const candidates = await seedMessagingCandidateExpiration(database, pipeline);
  const selected = candidates.cases.find((resource) => resource.name === "selected")!;
  const retiredRef = randomUUID(), retiredVersion = 2;
  const envelope = await createMessagingSecretCipher(pipeline.config).seal(randomUUID(), { tribeId: selected.tribeId, connectionId: selected.connectionId, connectionVersion: retiredVersion, resourceId: retiredRef });
  await database.withContext(pipeline.own, async (transaction) => {
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,created_at,last_activity_at,retired_at,purge_after) values (${selected.connectionId},${selected.tribeId},${retiredVersion},${pipeline.config.environment},${pipeline.config.securityEpoch},${retiredRef},transaction_timestamp()-interval '16 days',transaction_timestamp()-interval '48 hours',transaction_timestamp()-interval '25 hours',transaction_timestamp()-interval '1 hour')`);
    await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext,created_at,retired_at) values (${retiredRef},${selected.tribeId},${selected.connectionId},${retiredVersion},${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)},transaction_timestamp()-interval '16 days',transaction_timestamp()-interval '25 hours')`);
  });
  const rotated = await retainedSuccessor(pipeline.config);
  const backend = { userId: null, email: null };
  /** @returns Only immutable metadata, presence flags and original usage references. */
  const snapshot = () => database.withContext(backend, async (transaction) => ({
    credentials: (await transaction.execute<{ secret_ref: string; tribe_id: string; connection_id: string; connection_version: number; key_id: string; has_material: boolean; created_at: string; retired_at: string | null; purge_after: string | null; purged_at: string | null }>(sql`select secret_ref,tribe_id,connection_id,connection_version,key_id,iv is not null and ciphertext is not null as has_material,created_at::text,retired_at::text,purge_after::text,purged_at::text from public.messaging_secret_envelopes order by secret_ref`)).rows,
    usage: (await transaction.execute(sql`select id,tribe_id,contact_subject_id,occurred_at::text from public.messaging_usage_events order by id`)).rows,
    policies: (await transaction.execute(sql`select tribe_id,version,allowed_countries,verification_daily_limit,notification_daily_limit from public.messaging_usage_policies order by tribe_id`)).rows,
    original: (await transaction.execute(sql`select id,connection_id,connection_version,payload_mac_key_id,created_at::text,deadline_at::text from public.message_deliveries where id=${pipeline.original.deliveryId}`)).rows,
    challenge: (await transaction.execute(sql`select id,version,mac_key_id,fingerprint_key_id,code_envelope_id,created_at::text,expires_at::text from public.contact_verification_challenges where id=${pipeline.original.challengeId}`)).rows,
    proofs: (await transaction.execute(sql`select purpose,key_id,created_at::text from public.messaging_key_material_proofs order by purpose,key_id`)).rows,
  }));
  return { pipeline, candidates, rotated, retiredRef, snapshot };
}
