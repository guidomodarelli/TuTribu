/** Seeds a leader's Google session, identity binding and candidate credential so human messaging authority runs against real rows. @module messaging-human-secret-authority-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { createMessagingSecurityConfig, type MessagingKeyPurpose, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { MESSAGING_INITIAL_PROVIDER_ID } from "@/src/modules/messaging/constants/messaging-public-contract";
import type { AuthorizedMessagingContext, MessagingSecurityFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MESSAGING_HUMAN_SECRET_AUTHORITY_FIXTURE as FIXTURE } from "./constants/messaging-secret-authority-reuse";

/**
 * Applies the identity, tribe and messaging artifacts and inserts one leader with a live session, its Google binding and a candidate connection with a sealed credential.
 * @param database - Owned ephemeral branch.
 * @returns The leader's human context, its database actor and the security facts the provider reader compares.
 */
export async function prepareMessagingHumanSecretAuthority(database: AcademyAdmissionTestDatabase): Promise<{ context: AuthorizedMessagingContext; actor: { userId: string; email: null }; securityFacts: MessagingSecurityFacts }> {
  for (const artifact of FIXTURE.migrations) await database.applyMigration(artifact);
  const keyrings = {} as Record<MessagingKeyPurpose, MessagingKeyringInput>;
  for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) { const activeKeyId = randomUUID(); keyrings[purpose] = { activeKeyId, keys: [{ id: activeKeyId, material: randomBytes(FIXTURE.keyBytes) }] }; }
  const config = await createMessagingSecurityConfig({ environment: randomUUID(), securityEpoch: randomUUID(), recoveryLocked: false, keyrings });
  const userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), tribeId = randomUUID(), connectionId = randomUUID(), secretRef = randomUUID(), email = `${userId}@gmail.com`;
  const actor = { userId, email: null };
  const context: AuthorizedMessagingContext = { authorizationPurpose: "sensitive_leader", actorUserId: userId, sessionId, accountId, subject, tribeId, connectionId, connectionVersion: 1, environment: config.environment, securityEpoch: config.securityEpoch, operation: "read_messaging_senders", requestId: randomUUID(), resourceId: connectionId, secretRef };
  const envelope = await createMessagingSecretCipher(config).seal(randomUUID(), { tribeId, connectionId, connectionVersion: 1, resourceId: secretRef });
  await database.withContext(actor, async (transaction) => {
    const instant = new Date(String((await transaction.execute(sql`select clock_timestamp() as now`)).rows[0].now));
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic human authority leader',${email},false,${instant},${instant})`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},${instant},${instant})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},${new Date(instant.getTime() + FIXTURE.sessionLifetimeMs)},${instant},${instant})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${userId},${accountId},${subject},${email})`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic human authority tribe',${`human-authority-${tribeId}`},${userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${userId},'leader','active')`);
    await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,provider,environment,security_epoch,candidate_version) values (${connectionId},${tribeId},${userId},${MESSAGING_INITIAL_PROVIDER_ID},${config.environment},${config.securityEpoch},1)`);
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref) values (${connectionId},${tribeId},1,${config.environment},${config.securityEpoch},${secretRef})`);
    await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${secretRef},${tribeId},${connectionId},1,${config.environment},${config.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
  });
  return { context, actor, securityFacts: { environment: config.environment, securityEpoch: config.securityEpoch, recoveryLocked: false } };
}
