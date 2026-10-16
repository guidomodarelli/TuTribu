/** Prepares real account trust and selected encrypted email readiness without contacting a provider. @module admission-notification-collection-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionNotificationRecipientEmails } from "./admission-notification-recipient-email-fixture";
import { seedContactVerificationDatabase } from "./contact-verification-database-fixture";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";

/** @param database - Fully owned branch, including actual current guards and cryptography. @returns Genuine current trust, selected tested email capability and private in-memory keys, never a sender or simulated receipt. */
export async function prepareAdmissionNotificationCollection(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareAdmissionNotificationRecipientEmails(database), keys = await seedContactVerificationDatabase(database);
  const connectionId = randomUUID(), secretRef = randomUUID(), senderId = randomUUID();
  const envelope = await createMessagingSecretCipher(keys.config).seal(randomUUID(), { tribeId: fixture.tribeId, connectionId, connectionVersion: 1, resourceId: secretRef });
  await database.withContext(fixture.own, async (transaction) => {
    await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,verification_daily_limit) values (${fixture.tribeId},0)`);
    await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,candidate_version) values (${connectionId},${fixture.tribeId},${fixture.leaderId},'degraded',${keys.config.environment},${keys.config.securityEpoch},false,null)`);
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,credential_validation_status,is_test_mode,email_sender_id) values (${connectionId},${fixture.tribeId},1,${keys.config.environment},${keys.config.securityEpoch},${secretRef},'valid',false,${senderId})`);
    await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${secretRef},${fixture.tribeId},${connectionId},1,${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
    await transaction.execute(sql`insert into public.messaging_connection_capabilities(connection_id,tribe_id,connection_version,channel,state,sender_id,checked_at,tested_at) values (${connectionId},${fixture.tribeId},1,'email','prepared',${senderId},clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=1,is_candidate=false,candidate_version=null,state='active' where id=${connectionId}`);
    await transaction.execute(sql`insert into public.admission_email_settings(tribe_id,enabled,enabled_at,version,time_zone,changed_by_user_id) values (${fixture.tribeId},true,clock_timestamp(),1,'UTC',${fixture.leaderId})`);
  });
  return { fixture, keys, connectionId };
}
