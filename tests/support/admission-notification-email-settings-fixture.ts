/** Seeds only native prerequisite metadata for the independent settings owner, without provider or onboarding work. @module admission-notification-email-settings-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareContactVerificationDatabase } from "./contact-verification-database-fixture";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { PostgresAdmissionNotificationEmailSettingsRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-email-settings-repository";
import { createAdmissionPlatformSecurityReader } from "@/src/modules/academy-admissions/infrastructure/composition/admission-platform-security";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/**
 * Seeds scoped synthetic current identity and resource metadata under every installed guard.
 * @param database - This run's confirmed owned branch; the real migration command installs the journal.
 * @param securityConfig - Optional purpose-separated synthetic material shared only with an owned native server process.
 * @returns The real settings repository and controls for prerequisite metadata only. This fixture does not claim a new OAuth, diagnostic or activation.
 */
export async function prepareAdmissionEmailSettings(database: AcademyAdmissionTestDatabase, securityConfig?: MessagingSecurityConfig) {
  const fixture = await prepareContactVerificationDatabase(database, securityConfig), own = fixture.own;
  const tribeId = randomUUID(), connectionId = randomUUID(), secretRef = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID();
  const credential = await createMessagingSecretCipher(fixture.config).seal(randomUUID(), { tribeId, connectionId, connectionVersion: 1, resourceId: secretRef });
  const replacementKeyId = randomUUID();
  const replacementKey = await crypto.subtle.importKey("raw", new Uint8Array(randomBytes(MESSAGING_CRYPTO.keyBytes)), { name: MESSAGING_CRYPTO.aesAlgorithm }, false, ["encrypt", "decrypt"]);
  await database.withContext(own, async (transaction) => {
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic email settings tribe',${`email-settings-${tribeId}`},${own.userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${own.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',false)`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${own.userId},'google',${subject},clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${own.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${own.userId},${accountId},${subject},${own.email})`);
    await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,verification_daily_limit) values (${tribeId},0)`);
    await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,candidate_version) values (${connectionId},${tribeId},${own.userId},'ready',${fixture.config.environment},${fixture.config.securityEpoch},true,1)`);
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,email_sender_id,credential_validation_status,credential_validated_at,is_test_mode) values (${connectionId},${tribeId},1,${fixture.config.environment},${fixture.config.securityEpoch},${secretRef},${randomUUID()},'valid',clock_timestamp(),false)`);
    await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${secretRef},${tribeId},${connectionId},1,${credential.environment},${credential.securityEpoch},${credential.keyId},${Buffer.from(credential.iv)},${Buffer.from(credential.ciphertext)})`);
    await transaction.execute(sql`insert into public.messaging_connection_capabilities(connection_id,tribe_id,connection_version,channel,sender_id,state) select connection_id,tribe_id,version,'email',email_sender_id,'unprepared' from public.messaging_connection_versions where connection_id=${connectionId}`);
  });
  const base = { userId: own.userId, sessionId, tribeId, requestId: randomUUID(), role: "leader" as const, membershipStatus: "active" as const, resourceId: tribeId };
  const read: AuthorizedAdmissionContext = { ...base, action: "read_policy" };
  const change: AuthorizedAdmissionContext = { ...base, action: "configure_policy", sensitiveOperation: "update_admission_email_settings" };
  let recoveryLocked = false, credentialAvailable = true, loseReply = false;
  const readSecurityConfig = async () => ({ ...fixture.config, recoveryLocked, keyrings: { ...fixture.config.keyrings, credential: credentialAvailable ? fixture.config.keyrings.credential : { ...fixture.config.keyrings.credential, activeKeyId: replacementKeyId, keys: new Map([[replacementKeyId, replacementKey]]) } } });
  const repository = new PostgresAdmissionNotificationEmailSettingsRepository(async (_context, run) => {
    const result = await database.withContext(own, run);
    if (loseReply && typeof result === "object" && result !== null && "state" in result && result.state === "completed") { loseReply = false; throw new Error("Synthetic settings COMMIT reply lost"); }
    return result;
  }, readSecurityConfig, createAdmissionPlatformSecurityReader(readSecurityConfig));
  /** @returns After selecting only the native synthetic version; no production activation is claimed. */
  const selectConnection = () => database.withContext(own, (transaction) => transaction.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=1,is_candidate=false,candidate_version=null,state='active' where id=${connectionId} and tribe_id=${tribeId}`));
  /** @returns After marking this exact synthetic sender/version tested; no provider call or diagnostic receipt is fabricated. */
  const prepareEmail = () => database.withContext(own, (transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='prepared',checked_at=clock_timestamp(),tested_at=clock_timestamp() where connection_id=${connectionId} and tribe_id=${tribeId} and connection_version=1 and channel='email'`));
  /** @param expectedVersion - Original configuration version. @param enabled - Explicit target state. @param timeZone - Boundary-valid requested zone. @returns One new confirmed original intent. */
  const command = (expectedVersion: number, enabled: boolean, timeZone = "America/Argentina/Buenos_Aires") => ({ operationId: randomUUID(), confirmed: true as const, expectedVersion, enabled, timeZone });
  return { own, read, change, repository, command, config: fixture.config, selectConnection, prepareEmail, setRecoveryLocked: (value: boolean) => { recoveryLocked = value; }, setCredentialAvailable: (value: boolean) => { credentialAvailable = value; }, loseNextReply: () => { loseReply = true; } };
}
