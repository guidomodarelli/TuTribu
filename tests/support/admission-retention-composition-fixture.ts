/** Seeds every private retention category under the complete registered migration command. @module admission-retention-composition-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionPrivateRetention } from "./admission-private-retention-fixture";
import { seedAllowlistImportRetention } from "./allowlist-import-retention-fixture";
import { seedMessagingCandidateExpiration } from "./messaging-candidate-expiration-fixture";
import { seedContactVerificationChallenge } from "./contact-verification-database-fixture";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { createMessagingSecurityConfig, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { applyAdmissionRetentionHistoricalPrefix } from "./admission-retention-migration-prefix";
import { ADMISSION_RETENTION_COMPOSITION_FIXTURE } from "./constants/admission-retention-composition";

/** @param database - Exact owned disposable branch. @returns Scoped lifecycle snapshots without returning recoverable credentials or code bytes. */
export async function prepareAdmissionRetentionComposition(database: AcademyAdmissionTestDatabase) {
  await applyAdmissionRetentionHistoricalPrefix(database);
  /** @returns Independent fixture material; no hosting/pilot key source is consulted. */
  const keyring = (): MessagingKeyringInput => { const id = randomUUID(); return { activeKeyId: id, keys: [{ id, material: randomBytes(MESSAGING_CRYPTO.keyBytes) }] }; };
  const config = await createMessagingSecurityConfig({ environment: ADMISSION_RETENTION_COMPOSITION_FIXTURE.securityEnvironment, securityEpoch: randomUUID(), recoveryLocked: false, keyrings: { credential: keyring(), otp_envelope: keyring(), verification_mac: keyring(), invitation_token: keyring(), contact_fingerprint: keyring(), operation_payload: keyring() } });
  const bootstrapUserId = randomUUID(), bootstrap = { userId: bootstrapUserId, email: `${bootstrapUserId}@example.test` };
  await database.withContext({ userId: null, email: null }, (transaction) => transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${bootstrapUserId},'Synthetic historical import manager',${bootstrap.email},false,transaction_timestamp()-interval '20 days',transaction_timestamp()-interval '20 days')`));
  const imports = await seedAllowlistImportRetention(database, { own: bootstrap, config });
  const privateData = await prepareAdmissionPrivateRetention(database, config);
  const security = { own: { userId: privateData.managerId, email: `${privateData.managerId}@example.test` }, config: privateData.security };
  const candidates = await seedMessagingCandidateExpiration(database, security);
  const verificationFixture = { userId: candidates.userId, own: candidates.own, config: privateData.security };
  const nativeNow = await database.withContext(security.own, async (transaction) => new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now));
  const expiredVerification = await seedContactVerificationChallenge(database, verificationFixture, "admission", new Date(nativeNow.getTime() - ADMISSION_RETENTION_COMPOSITION_FIXTURE.expiredVerificationAgeMs));
  const currentVerification = await seedContactVerificationChallenge(database, verificationFixture);
  const selected = candidates.cases.find((resource) => resource.name === "selected")!;
  const retiredSecretRef = randomUUID(), retiredVersion = 2;
  const envelope = await createMessagingSecretCipher(privateData.security).seal(randomUUID(), { tribeId: selected.tribeId, connectionId: selected.connectionId, connectionVersion: retiredVersion, resourceId: retiredSecretRef });
  await database.withContext(security.own, async (transaction) => {
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,created_at,last_activity_at,retired_at,purge_after) values (${selected.connectionId},${selected.tribeId},${retiredVersion},${privateData.security.environment},${privateData.security.securityEpoch},${retiredSecretRef},transaction_timestamp()-interval '16 days',transaction_timestamp()-interval '48 hours',transaction_timestamp()-interval '25 hours',transaction_timestamp()-interval '1 hour')`);
    await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext,created_at,retired_at) values (${retiredSecretRef},${selected.tribeId},${selected.connectionId},${retiredVersion},${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)},transaction_timestamp()-interval '16 days',transaction_timestamp()-interval '25 hours')`);
  });
  const backend = { userId: null, email: null };
  /** @returns Original request/decision metadata and material-presence flags, never message text or fingerprints. */
  const admissionSnapshot = () => database.withContext(backend, async (transaction) => ({
    requests: (await transaction.execute(sql`select request.id,request.status,request.version,request.binding_id,request.normalized_contact is not null as has_contact,request.applicant_message is not null as has_message,request.private_material_minimized_at is not null as minimized,decision.internal_reason is not null as has_internal_reason,decision.external_message is not null as has_external_message from public.academy_admission_requests request left join public.academy_admission_decisions decision on decision.id=request.decision_id where request.tribe_id=${privateData.tribeId} order by request.id`)).rows,
    liveAudit: (await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_audit_events`)).rows,
    retiredAudit: (await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_retired_audit_events`)).rows,
  }));
  /** @returns Reference, byte-presence and original OTP metadata without encrypted/plaintext material. */
  const secretSnapshot = () => database.withContext(backend, async (transaction) => ({
    retiredSecret: (await transaction.execute(sql`select secret_ref,connection_version,key_id,retired_at::text,purge_after::text,purged_at is not null as purged,iv is not null and ciphertext is not null as has_material from public.messaging_secret_envelopes where secret_ref=${retiredSecretRef}`)).rows,
    verification: (await transaction.execute(sql`select challenge.id,challenge.state,challenge.version,challenge.code_mac is not null as has_mac,challenge.code_envelope_id,challenge.created_at::text,challenge.expires_at::text,envelope.id is not null as has_envelope from public.contact_verification_challenges challenge left join public.verification_code_envelopes envelope on envelope.id=challenge.code_envelope_id where challenge.id in (${expiredVerification.challengeId},${currentVerification.challengeId}) order by challenge.id`)).rows,
  }));
  return { privateData, imports, candidates, retiredSecretRef, expiredVerificationId: expiredVerification.challengeId, currentVerificationId: currentVerification.challengeId, admissionSnapshot, secretSnapshot };
}
