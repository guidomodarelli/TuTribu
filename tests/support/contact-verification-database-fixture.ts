/** Provides synthetic SQL/Web Crypto fixtures for local verification and proof application. @module contact-verification-database-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { createMessagingSecurityConfig, type MessagingKeyPurpose, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { createVerificationCodeEnvelope } from "@/src/modules/messaging/infrastructure/encryption/verification-code-envelope";
import { createVerificationCodeMac } from "@/src/modules/academy-admissions/infrastructure/verification/verification-code-mac";
import { PostgresContactVerificationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-contact-verification-repository";
import { PostgresVerificationFailureBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-failure-budget";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import {createMessagingSecretCipher} from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";

/**
 * Applies actual feature artifacts exclusively to this run's owned branch.
 * @param database - Disposable branch whose ownership has already been checked.
 * @returns Synthetic account/context and nonextractable, purpose-separated test keys.
 */
export async function prepareContactVerificationDatabase(database: AcademyAdmissionTestDatabase) {
  for (const migration of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261007040000_add_messaging_connection_name.sql"]) await database.applyMigration(migration);
  const userId: string = randomUUID();
  const own = { userId, email: `${userId}@example.test` };
  const keyring = (purpose: MessagingKeyPurpose): MessagingKeyringInput => ({ activeKeyId: `${purpose}-current`, keys: [{ id: `${purpose}-current`, material: randomBytes(32) }] });
  const config = await createMessagingSecurityConfig({
    environment: "synthetic-local", securityEpoch: "synthetic-epoch", recoveryLocked: false,
    keyrings: {
      credential: keyring(MESSAGING_KEY_PURPOSE.credential), otp_envelope: keyring(MESSAGING_KEY_PURPOSE.otpEnvelope),
      verification_mac: keyring(MESSAGING_KEY_PURPOSE.verificationMac), invitation_token: keyring(MESSAGING_KEY_PURPOSE.invitationToken),
      contact_fingerprint: keyring(MESSAGING_KEY_PURPOSE.contactFingerprint), operation_payload: keyring(MESSAGING_KEY_PURPOSE.operationPayload),
    },
  });
  await database.withContext(own, async (transaction) => {
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic code account',${own.email},false,clock_timestamp(),clock_timestamp())`);
  });
  return { userId, own, config };
}

/**
 * Seeds a complete private challenge/delivery/envelope cycle without any provider request.
 * @param database - Owned branch with the actual shipped artifacts.
 * @param fixture - Synthetic account and private Web Crypto configuration.
 * @param purpose - Admission or diagnostic source, with its corresponding epoch rule.
 * @param issuedAt - Optional synthetic historical issue timestamp for immutable-lifetime scenarios.
 * @param diagnosticResource - Optional configured immutable sender/secret seeded at creation for the diagnostic owner.
 * @returns The test-only code and exact protected challenge scope.
 */
export async function seedContactVerificationChallenge(database: AcademyAdmissionTestDatabase, fixture: Awaited<ReturnType<typeof prepareContactVerificationDatabase>>, purpose: VerificationChallengeScope["purpose"] = "admission", issuedAt?: Date,diagnosticResource?:{secretRef:string;senderId:string}) {
  const tribeId = randomUUID(), connectionId = randomUUID(), challengeId = randomUUID(), deliveryId = randomUUID(), envelopeId = randomUUID();
  const scope: VerificationChallengeScope = { userId: fixture.userId, tribeId, connectionId, connectionVersion: 1, securityEpoch: fixture.config.securityEpoch, purpose, verificationEpoch: purpose === "admission" ? 1 : null, channel: "email", contact: { type: "email", value: fixture.own.email } };
  const code = "429017";
  await database.withContext(fixture.own, async (transaction) => {
    const createdAt = issuedAt ?? new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    const expiresAt = new Date(createdAt.getTime() + 600_000);
    const context = { ...scope, challengeId, createdAt, expiresAt };
    const signed = await createVerificationCodeMac(fixture.config).sign(code, context);
    const envelope = await createVerificationCodeEnvelope(fixture.config).seal(code, context, createdAt);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic code tribe',${`code-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,candidate_version) values (${connectionId},${tribeId},${fixture.userId},'degraded',${fixture.config.environment},${scope.securityEpoch},true,1)`);
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,email_sender_id) values (${connectionId},${tribeId},1,${fixture.config.environment},${scope.securityEpoch},${diagnosticResource?.secretRef??null},${diagnosticResource?.senderId??null})`);
    if(diagnosticResource){const credential=await createMessagingSecretCipher(fixture.config).seal(randomUUID(),{tribeId,connectionId,connectionVersion:1,resourceId:diagnosticResource.secretRef});await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${diagnosticResource.secretRef},${tribeId},${connectionId},1,${credential.environment},${credential.securityEpoch},${credential.keyId},${Buffer.from(credential.iv)},${Buffer.from(credential.ciphertext)})`);}
    await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${deliveryId},${tribeId},${connectionId},1,${fixture.config.environment},${scope.securityEpoch},${purpose},${challengeId},${fixture.userId},${challengeId},'email',${randomUUID()},${randomBytes(32)},'synthetic-payload','{}',1,${createdAt},${createdAt},${expiresAt})`);
    await transaction.execute(sql`insert into public.contact_verification_challenges(id,user_id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,purpose,verification_epoch,connection_id,connection_version,security_epoch,channel,created_at,expires_at,code_mac,mac_key_id,code_envelope_id,delivery_id) values (${challengeId},${fixture.userId},${tribeId},'email',${fixture.own.email},${randomBytes(32)},'synthetic-contact',${purpose},${scope.verificationEpoch},${connectionId},1,${scope.securityEpoch},'email',${createdAt},${expiresAt},${Buffer.from(signed.mac)},${signed.keyId},${envelopeId},${deliveryId})`);
    await transaction.execute(sql`insert into public.verification_code_envelopes(id,tribe_id,connection_id,connection_version,challenge_id,delivery_id,environment,security_epoch,key_id,iv,ciphertext,created_at,expires_at) values (${envelopeId},${tribeId},${connectionId},1,${challengeId},${deliveryId},${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)},${createdAt},${expiresAt})`);
  });
  return { scope, challengeId, deliveryId, envelopeId, code };
}

/**
 * Binds owner authorization and the private limiter to the same guarded transaction.
 * @param transaction - Actual guarded SQL transaction from the owned branch.
 * @param fixture - Synthetic authenticated account and test keyrings.
 * @param authorize - Own port double for current context, including deliberate revocation cases.
 * @returns Real persistence adapters without a mocked database or cryptographic library.
 */
export function createContactVerificationWriter(transaction: RequestDatabase, fixture: Awaited<ReturnType<typeof prepareContactVerificationDatabase>>, authorize = async (_database: RequestDatabase, scope: VerificationChallengeScope) => scope.userId === fixture.userId) {
  return new PostgresContactVerificationRepository(transaction, authorize, () => Promise.resolve(fixture.config), new PostgresVerificationFailureBudget(transaction));
}
