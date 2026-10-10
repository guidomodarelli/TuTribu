/** @vitest-environment node */
/** Exercises candidate creation with actual PostgreSQL, current authority, ledger and Web Crypto. @module messaging-connections-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingConnectionCreation } from "@/tests/support/messaging-connection-fixture";
import { PostgresMessagingConnectionRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-repository";
import type { MessagingConnectionCreationContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-management";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import type { MessagingSecretEnvelope } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { makeSignature } from "better-auth/crypto";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("private messaging connection management", () => {
  it("should store one encrypted unselected candidate and replay its original result without resetting usage or validating a channel", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const prepared = await prepareMessagingConnectionCreation(database), operationId = randomUUID(), credential = randomUUID();
      const input = { operationId, confirmed: true as const, providerId: "zavu" as const, name: "Conexión de prueba", apiKey: credential };
      const created = await prepared.repository.create(prepared.context, input);
      expect(created).toMatchObject({ state: "completed", replayed: false, result: { name: input.name, version: 1, configurationVersion: 1, state: "draft", maskedCredential: "••••••••" } });
      if (created.state !== "completed") throw new Error("Expected committed candidate");
      const replayed = await prepared.repository.create(prepared.context, input);
      expect(replayed).toMatchObject({ state: "completed", replayed: true, result: created.result });
      const stored = await database.withContext(prepared.fixture.own, async (transaction) => ({
        connection: (await transaction.execute(sql`select id,name,state,is_selected,is_candidate,selected_version,candidate_version from public.tenant_messaging_connections where tribe_id=${prepared.context.tribeId}`)).rows,
        versions: (await transaction.execute(sql`select version,credential_validation_status,is_test_mode,provider_project_ref,provider_team_ref,provider_key_ref from public.messaging_connection_versions where tribe_id=${prepared.context.tribeId}`)).rows,
        envelope: (await transaction.execute<{ secret_ref:string;format:number;purpose:"credential";environment:string;security_epoch:string;key_id:string;iv:Uint8Array;ciphertext:Uint8Array }>(sql`select secret_ref,format,purpose,environment,security_epoch,key_id,iv,ciphertext from public.messaging_secret_envelopes where tribe_id=${prepared.context.tribeId}`)).rows[0],
        counts: (await transaction.execute(sql`select (select count(*)::int from public.messaging_usage_policies where tribe_id=${prepared.context.tribeId}) as usage,(select count(*)::int from public.academy_admission_policies where tribe_id=${prepared.context.tribeId}) as policies,(select count(*)::int from public.messaging_connection_capabilities where tribe_id=${prepared.context.tribeId}) as capabilities,(select count(*)::int from public.message_deliveries where tribe_id=${prepared.context.tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_events where tribe_id=${prepared.context.tribeId}) as events`)).rows[0],
        ledger: (await transaction.execute(sql`select public_result from public.academy_admission_operations where tribe_id=${prepared.context.tribeId}`)).rows,
      }));
      expect(stored.connection).toEqual([{ id:created.result.id,name:input.name,state:"draft",is_selected:false,is_candidate:true,selected_version:null,candidate_version:1 }]);
      expect(stored.versions).toEqual([{version:1,credential_validation_status:"not_validated",is_test_mode:null,provider_project_ref:null,provider_team_ref:null,provider_key_ref:null}]);
      expect(stored.counts).toEqual({usage:0,policies:0,capabilities:0,deliveries:0,events:0});
      expect(JSON.stringify(stored.ledger)).not.toContain(credential);
      const envelope: MessagingSecretEnvelope = {format:stored.envelope.format,purpose:stored.envelope.purpose,environment:stored.envelope.environment,securityEpoch:stored.envelope.security_epoch,keyId:stored.envelope.key_id,iv:stored.envelope.iv,ciphertext:stored.envelope.ciphertext};
      const cipher = createMessagingSecretCipher(prepared.fixture.config);
      const scope = { tribeId:prepared.context.tribeId,connectionId:created.result.id,connectionVersion:1,resourceId:stored.envelope.secret_ref };
      expect(await cipher.open(envelope,scope)).toBe(credential);
      await expect(cipher.open(envelope,{...scope,connectionVersion:2})).rejects.toMatchObject({code:"messaging_crypto_authentication_failed"});
      await expect(prepared.repository.create(prepared.context,{...input,apiKey:randomUUID()})).rejects.toMatchObject({code:"idempotency_conflict"});
      await expect(prepared.repository.create(prepared.context,{...input,operationId:randomUUID()})).rejects.toMatchObject({code:"connection_conflict"});
    });
  },240_000);

  it("should close guardian, changed leadership, invalidated recency and expired session before persisting a credential", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const prepared = await prepareMessagingConnectionCreation(database);
      const input = () => ({operationId:randomUUID(),confirmed:true as const,providerId:"zavu" as const,name:"Conexión cerrada",apiKey:randomUUID()});
      await database.withContext(prepared.fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${prepared.context.tribeId} and user_id=${prepared.context.actorUserId}`));
      await expect(prepared.repository.create(prepared.context,input())).rejects.toMatchObject({code:"permission_denied"});
      await database.withContext(prepared.fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${prepared.context.tribeId} and user_id=${prepared.context.actorUserId}`));
      await database.withContext(prepared.fixture.own,(transaction)=>transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where tribe_id=${prepared.context.tribeId}`));
      await expect(prepared.repository.create(prepared.context,input())).rejects.toMatchObject({code:"reauthentication_required"});
      await database.withContext(prepared.fixture.own,(transaction)=>transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${prepared.context.sessionId}`));
      await expect(prepared.repository.create(prepared.context,input())).rejects.toMatchObject({code:"authentication_required"});
      const counts = await database.withContext(prepared.fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${prepared.context.tribeId}) as connections,(select count(*)::int from public.messaging_secret_envelopes where tribe_id=${prepared.context.tribeId}) as secrets,(select count(*)::int from public.academy_admission_operations where tribe_id=${prepared.context.tribeId}) as operations`)).rows[0]);
      expect(counts).toEqual({connections:0,secrets:0,operations:0});
    });
  },240_000);

  it("should serialize concurrent distinct creations into one candidate without duplicate credential material",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await prepareMessagingConnectionCreation(database);
      const inputs=[{operationId:randomUUID(),confirmed:true as const,providerId:"zavu" as const,name:"Primera candidata",apiKey:randomUUID()},{operationId:randomUUID(),confirmed:true as const,providerId:"zavu" as const,name:"Otra candidata",apiKey:randomUUID()}];
      const results=await Promise.allSettled(inputs.map((input)=>prepared.repository.create(prepared.context,input)));
      expect(results.filter((result)=>result.status==="fulfilled")).toHaveLength(1);
      const rejected=results.find((result)=>result.status==="rejected");
      expect(rejected).toMatchObject({status:"rejected",reason:{code:"connection_conflict"}});
      const counts=await database.withContext(prepared.fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${prepared.context.tribeId} and is_candidate) as candidates,(select count(*)::int from public.messaging_secret_envelopes where tribe_id=${prepared.context.tribeId}) as secrets,(select count(*)::int from public.messaging_connection_versions where tribe_id=${prepared.context.tribeId}) as versions,(select count(*)::int from public.academy_admission_operations where tribe_id=${prepared.context.tribeId} and state='completed') as completed`)).rows[0]);
      expect(counts).toEqual({candidates:1,secrets:1,versions:1,completed:1});
    });
  },240_000);

  it.each([false,true])("should recover a lost commit reply or close the now-expired session=%s without duplicating creation",async(expireAfterCommit)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await prepareMessagingConnectionCreation(database);let replyLost=false;
      const execute=async<Result>(context:MessagingConnectionCreationContext,run:(transaction:RequestDatabase)=>Promise<Result>):Promise<Result>=>{
        const result=await prepared.execute(context,run);
        if(!replyLost&&typeof result==="object"&&result!==null&&"state"in result&&result.state==="completed"){
          replyLost=true;
          if(expireAfterCommit)await database.withContext(prepared.fixture.own,(transaction)=>transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${prepared.context.sessionId}`));
          throw new Error("Synthetic connection commit reply was lost");
        }
        return result;
      };
      const repository=new PostgresMessagingConnectionRepository(execute,async()=>prepared.fixture.config),input={operationId:randomUUID(),confirmed:true as const,providerId:"zavu"as const,name:"Candidata confirmada",apiKey:randomUUID()};
      if(expireAfterCommit)await expect(repository.create(prepared.context,input)).rejects.toMatchObject({code:"authentication_required",operationId:undefined});
      else expect(await repository.create(prepared.context,input)).toMatchObject({state:"completed",replayed:true,result:{version:1,state:"draft"}});
      expect(replyLost).toBe(true);
      const counts=await database.withContext(prepared.fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${prepared.context.tribeId}) as connections,(select count(*)::int from public.messaging_secret_envelopes where tribe_id=${prepared.context.tribeId}) as secrets,(select count(*)::int from public.academy_admission_operations where tribe_id=${prepared.context.tribeId} and state='completed') as completed`)).rows[0]);
      expect(counts).toEqual({connections:1,secrets:1,completed:1});
    });
  },240_000);
});

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS!=="1")("native connection creation HTTP",()=>{
  it("should create and replay a masked draft through the native route without provider or admission effects",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await prepareMessagingConnectionCreation(database),slug=`connection-${prepared.context.tribeId}`;
      for(const migration of ["20261005093000_guard_academy_membership_sources.sql","20261007001000_read_public_admission_overview.sql"])await database.applyMigration(migration);
      await database.withContext(prepared.fixture.own,(transaction)=>transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${prepared.context.tribeId},'academy',true)`));
      await database.withServerEnvironment((environment)=>withAdmissionNextServer(environment,slug,async(origin,secret)=>{
        const cookie=`better-auth.session_token=${encodeURIComponent(`${prepared.sessionToken}.${await makeSignature(prepared.sessionToken,secret)}`)}`;
        const body={operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Candidata nativa",apiKey:randomUUID()},path=`${origin}/api/tribes/${slug}/messaging/connections`;
        const post=(input:unknown=body)=>fetch(path,{method:"POST",headers:{cookie,origin,"content-type":"application/json"},body:JSON.stringify(input)});
        const created=await post();expect(created.status).toBe(201);const initial=await created.json();
        expect(initial).toMatchObject({state:"completed",replayed:false,result:{state:"draft",version:1,configurationVersion:1,name:body.name,maskedCredential:"••••••••"}});
        expect(JSON.stringify(initial)).not.toContain(body.apiKey);
        const replayed=await post();expect(replayed.status).toBe(200);expect(await replayed.json()).toMatchObject({replayed:true,result:initial.result});
        expect((await post({...body,apiKey:randomUUID()})).status).toBe(409);
        const conflicting=await post({...body,operationId:randomUUID()});expect(conflicting.status).toBe(409);expect(await conflicting.json()).toMatchObject({code:"connection_conflict"});
        await database.withContext(prepared.fixture.own,(transaction)=>transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where tribe_id=${prepared.context.tribeId}`));
        expect((await post({...body,operationId:randomUUID()})).status).toBe(401);
        await database.withContext(prepared.fixture.own,(transaction)=>transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${prepared.context.sessionId}`));
        expect((await post({...body,operationId:randomUUID()})).status).toBe(401);
      }));
      const counts=await database.withContext(prepared.fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${prepared.context.tribeId}) as connections,(select count(*)::int from public.messaging_secret_envelopes where tribe_id=${prepared.context.tribeId}) as secrets,(select count(*)::int from public.messaging_usage_policies where tribe_id=${prepared.context.tribeId}) as usage,(select count(*)::int from public.academy_admission_policies where tribe_id=${prepared.context.tribeId}) as policies,(select count(*)::int from public.message_deliveries where tribe_id=${prepared.context.tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_events where tribe_id=${prepared.context.tribeId}) as events`)).rows[0]);
      expect(counts).toEqual({connections:1,secrets:1,usage:0,policies:0,deliveries:0,events:0});
    });
  },360_000);
});
