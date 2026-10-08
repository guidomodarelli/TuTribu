/** @vitest-environment node */
/** Exercises real issuer/marker/crypto/SecretStore/SDK/receipt through an owned branch and closed HTTP transport. @module verification-delivery-pipeline-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer, recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { PostgresVerificationDeliveryPreparation } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-delivery-preparation";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import { DispatchMessageDeliveriesUseCase } from "@/src/modules/messaging/application/use-cases/dispatch-message-deliveries-use-case";
import { createMessagingDispatchConfig } from "@/src/modules/messaging/infrastructure/config/messaging-dispatch-config";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingDispatchDiagnostic } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";

/**
 * Seeds the actual protected issuer and marker dependencies without changing default/production.
 * @param database - This run's disposable owned branch.
 * @returns Actual guarded executors, current resource and private crypto/SecretStore.
 */
async function preparePipeline(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationIssuer(database);
  for (const migration of ["20261005092500_guard_messaging_attempts.sql","20261005100000_guard_messaging_secret_retirement.sql","20261006140000_claim_messaging_deliveries_fairly.sql","20261006160000_purge_verification_delivery_material.sql"]) await database.applyMigration(migration);
  const issued = await fixture.issue();
  if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Synthetic pipeline issuance did not complete");
  let transactions = 0;
  const execute = async <Result>(actorUserId: string | null, run: (transaction: RequestDatabase) => Promise<Result>) => {
    transactions += 1;
    try { return await database.withContext({ userId: actorUserId, email: null }, run); }
    finally { transactions -= 1; }
  };
  const secrets = new PostgresEncryptedSecretStore(execute, { getAuthenticatedAccount: async () => null }, async () => fixture.config, "authorized_delivery");
  const preparation = new PostgresVerificationDeliveryPreparation(execute, secrets, async () => fixture.config);
  const repository = new PostgresMessageDeliveryRepository(execute, async () => true, async () => fixture.config);
  return { ...fixture, original: issued.result, execute, secrets, preparation, repository, get transactions() { return transactions; } };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("verification delivery pipeline", () => {
  it.each(["before_marker","after_marker"] as const)("should stop old leadership dispatch %s without recovering a key, changing the old credential or making any SDK request",async(stage)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await preparePipeline(database);await database.applyMigration("20261008200000_guard_messaging_leadership_changes.sql");const nextLeaderId=randomUUID(),claim=(await fixture.repository.claim({leaseToken:randomUUID(),limit:2,leaseSeconds:90}))[0],authorization=stage==="after_marker"?await fixture.repository.authorize(claim,randomUUID()):null;
      await database.withContext(fixture.own,async(transaction)=>{await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${nextLeaderId},'Synthetic successor',${`${nextLeaderId}@example.test`},false,clock_timestamp(),clock_timestamp())`);await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.scope.tribeId},${nextLeaderId},'guardian','active')`);await transaction.execute(sql`select id from public.tribes where id=${fixture.scope.tribeId} for update`);await transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`);await transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${fixture.scope.tribeId} and user_id=${nextLeaderId}`);});
      let credentialReads=0;const transport=createAdmissionProviderTransport([]),secrets={loadAuthorizedSecret:async(context:Parameters<typeof fixture.secrets.loadAuthorizedSecret>[0])=>{credentialReads+=1;return fixture.secrets.loadAuthorizedSecret(context);}},preparation=new PostgresVerificationDeliveryPreparation(fixture.execute,secrets,async()=>fixture.config);
      if(stage==="after_marker"){if(authorization?.outcome!=="authorized")throw new Error("Expected original dispatch marker");await expect(new ZavuMessageDeliverySender(preparation,transport.fetch).send(authorization.context,new AbortController().signal)).rejects.toMatchObject({code:"permission_denied"});}else expect((await fixture.repository.authorize(claim,randomUUID())).outcome).not.toBe("authorized");expect(credentialReads).toBe(0);expect(transport.receipts).toEqual([]);
      await database.withContext(fixture.own,async(transaction)=>{expect((await transaction.execute(sql`select state,contributed_by_user_id from public.tenant_messaging_connections where id=${fixture.scope.connectionId}`)).rows[0]).toEqual({state:"suspended",contributed_by_user_id:fixture.userId});const attempts=(await transaction.execute(sql`select state from public.message_delivery_attempts where delivery_id=${fixture.original.deliveryId}`)).rows,reservations=(await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows;if(stage==="after_marker"){expect(attempts).toEqual([{state:"in_flight"}]);expect(reservations).toEqual([{state:"consumed"}]);}else{expect(attempts).toEqual([]);expect(reservations).toEqual([]);}});
    });
  },600_000);
  it("should verify the actual jsonb frozen intent, decrypt private material and call SDK only after commit with one charged attempt", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePipeline(database);
      const providerId = randomUUID();
      let sentCode = "";
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
        expect(fixture.transactions).toBe(0);
        const body = await request.json() as { to: string; text: string; fallbackEnabled: boolean; channel: string; idempotencyKey: string };
        expect(body).toMatchObject({ to: fixture.scope.contact.value, channel: "email", fallbackEnabled: false });
        sentCode = body.text.match(/\d{6}/)?.[0] ?? "";
        expect(sentCode).toHaveLength(6);
        await database.withContext(fixture.own, async (transaction) => {
          expect((await transaction.execute(sql`select state from public.message_delivery_attempts where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "in_flight" }]);
          expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "consumed" }]);
          expect((await transaction.execute(sql`select id from public.academy_admission_operations where id=${body.idempotencyKey}`)).rows).toHaveLength(1);
        });
        return Response.json({ message: { id: providerId, direction: "outbound", channel: "email", status: "sent" } });
      } }]);
      const diagnostics: MessagingDispatchDiagnostic[] = [], deferred: Promise<void>[] = [];
      const sender = new ZavuMessageDeliverySender(fixture.preparation, transport.fetch);
      const dispatcher = new DispatchMessageDeliveriesUseCase(fixture.repository, sender, createMessagingDispatchConfig(), { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: (diagnostic) => { diagnostics.push(diagnostic); } });
      expect(await dispatcher.execute()).toMatchObject({ claimed: 1, authorized: 1, accepted: 1, delivered: 0, unknown: 0, unresolved: 0 });
      await Promise.all(deferred);
      expect(transport.receipts).toHaveLength(1);
      expect(diagnostics).toEqual([]);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ state: "issued" }]);
        expect((await transaction.execute(sql`select id from public.verification_code_envelopes where challenge_id=${fixture.original.challengeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select code_envelope_id,code_mac is not null as has_mac from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ code_envelope_id: null, has_mac: true }]);
        expect((await transaction.execute(sql`select id from public.academy_admission_verification_proofs where challenge_id=${fixture.original.challengeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select state,provider_message_id from public.message_delivery_attempts where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "accepted", provider_message_id: providerId }]);
        expect(await createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId: fixture.original.challengeId, operationId: randomUUID(), code: sentCode })).toMatchObject({ outcome: "verified" });
      });
    });
  }, 240_000);

  it("should recheck a verification quota reduced to zero while queued without SDK calls, reservation or code invalidation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture=await preparePipeline(database);
      const before=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select state,is_current,expires_at,invalidated_at,verification_epoch from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows);
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,version=version+1 where tribe_id=${fixture.scope.tribeId}`));
      const transport=createAdmissionProviderTransport([]);
      const diagnostics:MessagingDispatchDiagnostic[]=[],deferred:Promise<void>[]=[];
      const dispatcher=new DispatchMessageDeliveriesUseCase(fixture.repository,new ZavuMessageDeliverySender(fixture.preparation,transport.fetch),createMessagingDispatchConfig(),{now:Date.now,createId:randomUUID,defer:(work)=>{deferred.push(work);},report:(diagnostic)=>{diagnostics.push(diagnostic);}});
      expect(await dispatcher.execute()).toMatchObject({claimed:1,authorized:0,quotaDeferred:1,accepted:0,unknown:0,unresolved:0});
      await Promise.all(deferred);
      expect(transport.receipts).toEqual([]);
      expect(diagnostics).toEqual([]);
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select id from public.message_delivery_attempts where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select state,is_current,expires_at,invalidated_at,verification_epoch from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual(before);
        expect((await transaction.execute(sql`select state,queued_usage_policy_version from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{state:"queued",queued_usage_policy_version:1}]);
      });
    });
  },240_000);

  it("should reject crossed role, retired payload key and expired marker before SDK or credential disclosure", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePipeline(database);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      const authorized = await fixture.repository.authorize(claim, randomUUID());
      if (authorized.outcome !== "authorized") throw new Error("Synthetic pipeline marker did not complete");
      const transport = createAdmissionProviderTransport([]);
      let credentialReads = 0;
      const secrets = { async loadAuthorizedSecret(context: Parameters<typeof fixture.secrets.loadAuthorizedSecret>[0]) { credentialReads += 1; return fixture.secrets.loadAuthorizedSecret(context); } };
      const retired = new PostgresVerificationDeliveryPreparation(fixture.execute, secrets, async () => ({ ...fixture.config, keyrings: { ...fixture.config.keyrings, operation_payload: { ...fixture.config.keyrings.operation_payload, keys: new Map() } } }));
      await expect(new ZavuMessageDeliverySender(retired, transport.fetch).send(authorized.context, new AbortController().signal)).rejects.toMatchObject({ code: "messaging_crypto_key_unavailable" });
      expect(credentialReads).toBe(0);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`));
      await expect(new ZavuMessageDeliverySender(fixture.preparation, transport.fetch).send(authorized.context, new AbortController().signal)).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`);
        await transaction.execute(sql`update public.message_deliveries set lease_until=clock_timestamp()-interval '1 second',version=version+1 where id=${fixture.original.deliveryId}`);
      });
      await expect(new ZavuMessageDeliverySender(fixture.preparation, transport.fetch).send(authorized.context, new AbortController().signal)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(transport.receipts).toEqual([]);
      await database.withContext(fixture.own, async (transaction) => expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${authorized.context.attemptId}`)).rows).toEqual([{ state: "consumed" }]));
    });
  }, 240_000);

  it("should recheck the original code after credential loading and stop RPC if local verification consumed it during that gap", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePipeline(database);
      const { code } = await recoverTestVerificationCode(database, fixture, fixture.original.challengeId);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      const authorized = await fixture.repository.authorize(claim, randomUUID());
      if (authorized.outcome !== "authorized") throw new Error("Synthetic pipeline marker did not complete");
      const secrets = { async loadAuthorizedSecret(context: Parameters<typeof fixture.secrets.loadAuthorizedSecret>[0]) {
        const credential = await fixture.secrets.loadAuthorizedSecret(context);
        await database.withContext(fixture.own, async (transaction) => expect(await createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId: fixture.original.challengeId, operationId: randomUUID(), code })).toMatchObject({ outcome: "verified" }));
        return credential;
      } };
      const preparation = new PostgresVerificationDeliveryPreparation(fixture.execute, secrets, async () => fixture.config);
      const transport = createAdmissionProviderTransport([]);
      await expect(new ZavuMessageDeliverySender(preparation, transport.fetch).send(authorized.context, new AbortController().signal)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(transport.receipts).toEqual([]);
    });
  }, 240_000);

  it("should stop RPC when the credential key is retired after the real SecretStore returns its plaintext", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePipeline(database);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      const authorized = await fixture.repository.authorize(claim, randomUUID());
      if (authorized.outcome !== "authorized") throw new Error("Synthetic pipeline marker did not complete");
      let config = fixture.config;
      const secrets = { async loadAuthorizedSecret(context: Parameters<typeof fixture.secrets.loadAuthorizedSecret>[0]) {
        const credential = await fixture.secrets.loadAuthorizedSecret(context);
        config = { ...config, keyrings: { ...config.keyrings, credential: { ...config.keyrings.credential, keys: new Map() } } };
        return credential;
      } };
      const preparation = new PostgresVerificationDeliveryPreparation(fixture.execute, secrets, async () => config);
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: () => Response.json({ message: { id: randomUUID(), direction: "outbound", channel: "email", status: "sent" } }) }]);
      await expect(new ZavuMessageDeliverySender(preparation, transport.fetch).send(authorized.context, new AbortController().signal)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(transport.receipts).toEqual([]);
      await database.withContext(fixture.own, async (transaction) => expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${authorized.context.attemptId}`)).rows).toEqual([{ state: "consumed" }]));
    });
  }, 240_000);
});
