/** @vitest-environment node */
/** Exercises private credential reads against real PostgreSQL and native Web Crypto on owned branches. */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { createMessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import type { AuthorizedDeliveryMessagingContext, AuthorizedMessagingContext, MessagingAuthenticatedAccount } from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** Supplies independent synthetic keys without writing hosting or provider configuration. */
async function securityConfig() {
  const purposes = ["credential", "otp_envelope", "verification_mac", "invitation_token", "contact_fingerprint", "operation_payload"] as const;
  const keyrings = Object.fromEntries(purposes.map((purpose) => [purpose, { activeKeyId: randomUUID(), keys: [] as { id: string; material: Uint8Array }[] }]));
  for (const ring of Object.values(keyrings)) ring.keys.push({ id: ring.activeKeyId, material: randomBytes(32) });
  return createMessagingSecurityConfig({ environment: randomUUID(), securityEpoch: randomUUID(), recoveryLocked: false, keyrings: keyrings as Parameters<typeof createMessagingSecurityConfig>[0]["keyrings"] });
}

/** Seeds trusted synthetic identity and a consumed intent as database fixtures, never as a real login. */
async function prepareStore(database: AcademyAdmissionTestDatabase, encryptedForSecretRef?: string) {
  for (const artifact of ["20261005090000_create_admission_identity_evidence.sql", "20261005091000_create_academy_admission_core.sql", "20261005091500_guard_admission_evidence_transitions.sql", "20261005092000_create_tenant_messaging.sql", "20261005092500_guard_messaging_attempts.sql", "20261005095000_guard_global_identity_context.sql", "20261005100000_guard_messaging_secret_retirement.sql"]) await database.applyMigration(artifact);
  const config = await securityConfig();
  const userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), tribeId = randomUUID(), connectionId = randomUUID(), secretRef = randomUUID();
  const own = { userId, email: null };
  const instant = await database.withContext(own, async (transaction) => new Date(String((await transaction.execute(sql`select clock_timestamp() as now`)).rows[0].now)));
  const validUntil = new Date(instant.getTime() + 9 * 60_000);
  const sessionExpiresAt = new Date(instant.getTime() + 60 * 60_000);
  const context: AuthorizedMessagingContext = { authorizationPurpose: "sensitive_leader", actorUserId: userId, sessionId, accountId, subject, tribeId, connectionId, connectionVersion: 1, environment: config.environment, securityEpoch: config.securityEpoch, operation: "read_messaging_senders", requestId: randomUUID(), resourceId: connectionId, secretRef, authenticatedAt: instant, validUntil };
  const credential = randomUUID();
  const envelope = await createMessagingSecretCipher(config).seal(credential, { tribeId, connectionId, connectionVersion: 1, resourceId: encryptedForSecretRef ?? secretRef });
  const intentId = randomUUID();
  await database.withContext(own, async (transaction) => {
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic secret leader',${`${userId}@gmail.com`},false,${instant},${instant})`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},${instant},${instant})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},${sessionExpiresAt},${instant},${instant})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${userId},${accountId},${subject},${`${userId}@gmail.com`})`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic secret tribe',${`secret-${tribeId}`},${userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${userId},'leader','active')`);
    await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,environment,security_epoch,candidate_version) values (${connectionId},${tribeId},${userId},${config.environment},${config.securityEpoch},1)`);
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref) values (${connectionId},${tribeId},1,${config.environment},${config.securityEpoch},${secretRef})`);
    await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${secretRef},${tribeId},${connectionId},1,${config.environment},${config.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
    await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${userId},${sessionId},${accountId},${subject},${tribeId},${context.operation},${connectionId},${`/secret-${tribeId}`},${randomBytes(32)},'consumed',${instant},${validUntil},${instant})`);
    await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${userId},${accountId},${subject},${sessionId},${tribeId},${context.operation},${connectionId},${instant},${instant},${validUntil})`);
  });
  // The global-account port is owned by auth. SQL, not this empty evidence array, authorizes the read.
  const account: MessagingAuthenticatedAccount = { userId, session: { id: sessionId, expiresAt: sessionExpiresAt }, googleAccount: { id: accountId, subject }, recentAuthentication: [] };
  const configuration = vi.fn(async () => config);
  const store = new PostgresEncryptedSecretStore((actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), { getAuthenticatedAccount: async () => account }, configuration, "sensitive_leader");
  return { own, userId, tribeId, connectionId, secretRef, config, credential, context, store, configuration, account };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("encrypted messaging secret store", () => {
  it("should return backend-only material from current authoritative identity and leave storage unchanged", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareStore(database);
      expect(await fixture.store.loadAuthorizedSecret(fixture.context)).toBe(fixture.credential);
      const metadata = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select retired_at,purge_after from public.messaging_secret_envelopes where secret_ref=${fixture.secretRef}`)).rows[0]);
      expect(metadata).toEqual({ retired_at: null, purge_after: null });
    });
  }, 120_000);

  it("should reject crossed private context and lost authority before reading keys", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareStore(database);
      for (const changed of [{ actorUserId: randomUUID() }, { sessionId: randomUUID() }, { accountId: randomUUID() }, { subject: randomUUID() }, { tribeId: randomUUID() }, { connectionId: randomUUID() }, { resourceId: randomUUID() }, { connectionVersion: 2 }, { secretRef: randomUUID() }, { operation: "unknown_operation" }, { validUntil: new Date(0) }]) {
        await expect(fixture.store.loadAuthorizedSecret({ ...fixture.context, ...changed })).rejects.toMatchObject({ code: expect.stringMatching(/^(authentication_required|reauthentication_required|permission_denied|resource_unavailable)$/) });
      }
      expect(fixture.configuration).not.toHaveBeenCalled();
      await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await expect(fixture.store.loadAuthorizedSecret(fixture.context)).rejects.toMatchObject({ code: "permission_denied" });
      expect(fixture.configuration).not.toHaveBeenCalled();
    });
  }, 120_000);

  it("should close on external recovery, changed epoch or a retired resource without returning plaintext", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareStore(database);
      fixture.configuration.mockResolvedValueOnce({ ...fixture.config, recoveryLocked: true });
      await expect(fixture.store.loadAuthorizedSecret(fixture.context)).rejects.toMatchObject({ code: "connection_incomplete" });
      fixture.configuration.mockResolvedValueOnce({ ...fixture.config, securityEpoch: randomUUID() });
      await expect(fixture.store.loadAuthorizedSecret(fixture.context)).rejects.toMatchObject({ code: "connection_incomplete" });
      await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.messaging_connection_versions set retired_at=clock_timestamp() where connection_id=${fixture.connectionId}`));
      fixture.configuration.mockClear();
      await expect(fixture.store.loadAuthorizedSecret(fixture.context)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(fixture.configuration).not.toHaveBeenCalled();
    });
  }, 120_000);

  it("should preserve immutable material and irreversible retirement with a bounded purge deadline", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareStore(database);
      await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.messaging_secret_envelopes set retired_at=clock_timestamp() where secret_ref=${fixture.secretRef}`));
      await expect(database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.messaging_secret_envelopes set retired_at=null where secret_ref=${fixture.secretRef}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.messaging_secret_envelopes set key_id=${randomUUID()} where secret_ref=${fixture.secretRef}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.messaging_secret_envelopes set purge_after=retired_at+interval '25 hours' where secret_ref=${fixture.secretRef}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      const result = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select retired_at is not null as retired,purge_after<=retired_at+interval '24 hours' as bounded from public.messaging_secret_envelopes where secret_ref=${fixture.secretRef}`)).rows[0]);
      expect(result).toEqual({ retired: true, bounded: true });
      fixture.configuration.mockClear();
      await expect(fixture.store.loadAuthorizedSecret(fixture.context)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(fixture.configuration).not.toHaveBeenCalled();
    });
  }, 120_000);

  it("should require a current marker, consumed reservation and exact live lease for worker material", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareStore(database);
      const deliveryId = randomUUID(), leaseToken = randomUUID();
      const accountLookup = vi.fn(async () => null);
      const store = new PostgresEncryptedSecretStore((actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), { getAuthenticatedAccount: accountLookup }, fixture.configuration, "authorized_delivery");
      const context: AuthorizedDeliveryMessagingContext = { authorizationPurpose: "authorized_delivery", contributingLeaderUserId: fixture.userId, tribeId: fixture.tribeId, connectionId: fixture.connectionId, connectionVersion: 1, environment: fixture.config.environment, securityEpoch: fixture.config.securityEpoch, secretRef: fixture.secretRef, requestId: randomUUID(), deliveryId, attemptId: randomUUID(), attemptVersion: 1, leaseToken, sendAuthorizedAt: new Date(), authorizedUsagePolicyVersion: 1, operation: "dispatch_delivery" };
      await expect(store.loadAuthorizedSecret(context)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(fixture.configuration).not.toHaveBeenCalled();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id) values (${fixture.tribeId})`);
        await transaction.execute(sql`update public.tenant_messaging_connections set state='active',is_selected=true,selected_version=1,is_candidate=false,candidate_version=null where id=${fixture.connectionId}`);
        await transaction.execute(sql`update public.messaging_connection_versions set credential_validation_status='valid',credential_validated_at=clock_timestamp(),is_test_mode=false where connection_id=${fixture.connectionId}`);
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,state,checked_at,tested_at) values (${fixture.tribeId},${fixture.connectionId},1,'email','synthetic-secret-sender','prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`with instant as (select clock_timestamp() as now) insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) select ${deliveryId},${fixture.tribeId},${fixture.connectionId},1,${fixture.config.environment},${fixture.config.securityEpoch},'admission_notification',${randomUUID()},${fixture.userId},'synthetic-private-recipient','email',${randomUUID()},${randomBytes(32)},${randomUUID()},'{}',1,now,now,now+interval '1 hour' from instant`);
      });
      const claimed = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select * from public.claim_messaging_deliveries(${leaseToken},1,90)`)).rows[0]);
      const authorized = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select * from public.authorize_messaging_delivery_attempt(${deliveryId},${leaseToken},${claimed.delivery_version},${fixture.config.environment},${fixture.config.securityEpoch})`)).rows[0]);
      expect(authorized.outcome).toBe("authorized");
      const marker = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string; version: number; send_authorized_at: string }>(sql`select id,version,send_authorized_at from public.message_delivery_attempts where id=${authorized.attempt_id}`)).rows[0]);
      const current = { ...context, attemptId: marker.id, attemptVersion: marker.version, sendAuthorizedAt: new Date(marker.send_authorized_at) };
      expect(await store.loadAuthorizedSecret(current)).toBe(fixture.credential);
      expect(accountLookup).not.toHaveBeenCalled();
      fixture.configuration.mockClear();
      for (const changed of [{ leaseToken: randomUUID() }, { attemptVersion: 2 }, { authorizedUsagePolicyVersion: 2 }, { deliveryId: randomUUID() }]) await expect(store.loadAuthorizedSecret({ ...current, ...changed })).rejects.toMatchObject({ code: "resource_unavailable" });
      await expect(fixture.store.loadAuthorizedSecret(current)).rejects.toMatchObject({ code: "permission_denied" });
      await expect(store.loadAuthorizedSecret(fixture.context)).rejects.toMatchObject({ code: "permission_denied" });
      expect(fixture.configuration).not.toHaveBeenCalled();
      await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.message_deliveries set lease_until=clock_timestamp()-interval '1 second' where id=${deliveryId}`));
      await expect(store.loadAuthorizedSecret(current)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::integer as count from public.messaging_usage_reservations where tribe_id=${fixture.tribeId} and state='consumed'`)).rows[0].count)).toBe(1);
    });
  }, 120_000);

  it("should deny ordinary leader SQL reads even after a grant without bypass", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareStore(database);
      await database.grantTablesToNonBypass(["messaging_secret_envelopes"]);
      const rows = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select secret_ref from public.messaging_secret_envelopes`)).rows, "non_bypass");
      expect(rows).toEqual([]);
    });
  }, 120_000);

  it("should reject native cipher authentication from a different secret reference", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareStore(database, randomUUID());
      await expect(fixture.store.loadAuthorizedSecret(fixture.context)).rejects.toMatchObject({ code: "connection_incomplete", cause: { code: "messaging_crypto_authentication_failed" } });
    });
  }, 120_000);

  it("should not return material if its key is removed before the final external revalidation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareStore(database);
      const retiredKeyConfig = { ...fixture.config, keyrings: { ...fixture.config.keyrings, credential: { ...fixture.config.keyrings.credential, keys: new Map<string, CryptoKey>() } } };
      fixture.configuration.mockResolvedValueOnce(fixture.config).mockResolvedValueOnce(retiredKeyConfig);
      await expect(fixture.store.loadAuthorizedSecret(fixture.context)).rejects.toMatchObject({ code: "connection_incomplete" });
      expect(fixture.configuration).toHaveBeenCalledTimes(2);
    });
  }, 120_000);

  it("should purge retired bytes while preserving the version reference and irreversible metadata", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareStore(database);
      await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.messaging_secret_envelopes set retired_at=clock_timestamp()-interval '25 hours' where secret_ref=${fixture.secretRef}`));
      // Version history needs the reference; deleting the metadata row cannot satisfy the purge contract.
      await expect(database.withContext(fixture.own, async (transaction) => transaction.execute(sql`delete from public.messaging_secret_envelopes where secret_ref=${fixture.secretRef}`))).rejects.toMatchObject({ code: "23503" });
      const result = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select public.purge_retired_messaging_secret_material(10) as count`)).rows[0].count);
      expect(result).toBe(1);
      const rows = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select envelope.iv is null as iv_removed,envelope.ciphertext is null as ciphertext_removed,envelope.purged_at is not null as purged,version.secret_ref=envelope.secret_ref as reference_retained from public.messaging_secret_envelopes envelope join public.messaging_connection_versions version on version.secret_ref=envelope.secret_ref where envelope.secret_ref=${fixture.secretRef}`)).rows);
      expect(rows).toEqual([{ iv_removed: true, ciphertext_removed: true, purged: true, reference_retained: true }]);
      await expect(database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.messaging_secret_envelopes set purged_at=null where secret_ref=${fixture.secretRef}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select public.purge_retired_messaging_secret_material(10) as count`)).rows[0].count)).toBe(0);
    });
  }, 120_000);

  it("should rewrap live material with a new cipher key without replacing BYOK or resource identity", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareStore(database);
      const keyId = randomUUID();
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const config = { ...fixture.config, keyrings: { ...fixture.config.keyrings, credential: { ...fixture.config.keyrings.credential, activeKeyId: keyId, keys: new Map([[keyId, key]]) } } };
      const envelope = await createMessagingSecretCipher(config).seal(fixture.credential, { tribeId: fixture.tribeId, connectionId: fixture.connectionId, connectionVersion: 1, resourceId: fixture.secretRef });
      let directUpdateCode: string | undefined;
      try {
        await database.withContext(fixture.own, async (transaction) => transaction.execute(sql`update public.messaging_secret_envelopes set key_id=${keyId},iv=${Buffer.from(envelope.iv)},ciphertext=${Buffer.from(envelope.ciphertext)} where secret_ref=${fixture.secretRef}`));
      } catch (error) { directUpdateCode = (error as { cause?: { code?: string } }).cause?.code; }
      expect(directUpdateCode).toBe("23514");
      const previousKeyId = fixture.config.keyrings.credential.activeKeyId;
      const rewrapped = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select public.rewrap_messaging_secret_material(${fixture.secretRef},${fixture.tribeId},${fixture.connectionId},1,${fixture.config.environment},${fixture.config.securityEpoch},${previousKeyId},${keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)}) as changed`)).rows[0].changed);
      expect(rewrapped).toBe(true);
      fixture.configuration.mockResolvedValue(config);
      expect(await fixture.store.loadAuthorizedSecret(fixture.context)).toBe(fixture.credential);
      const identity = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select connection.version as connection_version,version.version as resource_version,version.secret_ref=${fixture.secretRef} as reference_retained,envelope.retired_at is null as live from public.tenant_messaging_connections connection join public.messaging_connection_versions version on version.connection_id=connection.id join public.messaging_secret_envelopes envelope on envelope.secret_ref=version.secret_ref where connection.id=${fixture.connectionId}`)).rows[0]);
      expect(identity).toEqual({ connection_version: 1, resource_version: 1, reference_retained: true, live: true });
    });
  }, 120_000);
});
