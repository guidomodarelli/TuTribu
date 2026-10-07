/** @vitest-environment node */
/** Exercises actual Next/Better Auth/SecretStore/SDK immutable configuration without external network or messages. @module messaging-connection-configuration-http-tests */
import {randomBytes,randomUUID} from "node:crypto";
import {join} from "node:path";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {makeSignature} from "better-auth/crypto";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {withAdmissionNextServer} from "@/tests/support/admission-next-server";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS!=="1")("native immutable configuration HTTP",()=>{
  it("should create exact versions while replay/no-op avoid resource RPC and current recency closes later writes",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),tribeId=fixture.context.tribeId,slug=`connection-${tribeId}`,credential=randomUUID(),senderId=randomUUID();
      for(const migration of["20261005093000_guard_academy_membership_sources.sql","20261007001000_read_public_admission_overview.sql","20261005100000_guard_messaging_secret_retirement.sql"])await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));
      let providerRequests=0;
      await database.withServerEnvironment((environment)=>withAdmissionNextServer(environment,slug,async(origin,secret)=>{
        const cookie=`better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken,secret)}`)}`,headers={cookie,origin,"content-type":"application/json"};
        const createdResponse=await fetch(`${origin}/api/tribes/${slug}/messaging/connections`,{method:"POST",headers,body:JSON.stringify({operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Versión nativa",apiKey:credential})});expect(createdResponse.status).toBe(201);const created=await createdResponse.json(),connectionId=created.result.id;
        await database.withContext(fixture.fixture.own,async(transaction)=>{
          const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000),intentId=randomUUID();
          await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.context.actorUserId},${fixture.context.sessionId},${fixture.context.accountId},${fixture.context.subject},${tribeId},'configure_messaging_connection',${connectionId},'/synthetic-native-configure',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
          await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.context.actorUserId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.sessionId},${tribeId},'configure_messaging_connection',${connectionId},${now},${now},${validUntil})`);
        });
        const path=`${origin}/api/tribes/${slug}/messaging/connections/${connectionId}/configuration`,body={operationId:randomUUID(),confirmed:true,expectedVersion:1,channel:"email",senderId},configure=(input:unknown=body)=>fetch(path,{method:"PUT",headers,body:JSON.stringify(input)});
        const first=await configure();expect(first.status).toBe(200);const initial=await first.json();expect(initial).toMatchObject({state:"completed",result:{id:connectionId,version:2,configurationVersion:2,changed:true,state:"draft"}});expect(JSON.stringify(initial)).not.toContain(credential);expect(providerRequests).toBe(1);
        const replay=await configure();expect(replay.status).toBe(200);expect(await replay.json()).toMatchObject({replayed:true,result:initial.result});expect(providerRequests).toBe(1);
        const noOp=await configure({...body,operationId:randomUUID(),expectedVersion:2});expect(noOp.status).toBe(200);expect(await noOp.json()).toMatchObject({result:{version:2,configurationVersion:2,changed:false}});expect(providerRequests).toBe(1);
        const second=await configure({...body,operationId:randomUUID(),expectedVersion:2,channel:"sms"});expect(second.status).toBe(200);expect(await second.json()).toMatchObject({result:{version:3,configurationVersion:3,changed:true}});expect(providerRequests).toBe(2);
        const historical=await configure();expect(historical.status).toBe(200);expect(await historical.json()).toMatchObject({replayed:true,result:initial.result});expect(providerRequests).toBe(2);
        expect((await configure({...body,operationId:randomUUID()})).status).toBe(409);expect((await configure({...body,expectedVersion:3})).status).toBe(409);expect(providerRequests).toBe(2);
        const current=await fetch(`${origin}/api/tribes/${slug}/messaging/configuration`,{headers:{cookie}});expect(current.status).toBe(200);expect(await current.json()).toMatchObject({audience:"leader",selected:null,candidate:{version:3,configurationVersion:3,credentialState:"not_validated",capabilities:[{channel:"email",state:"unprepared",testedAt:null},{channel:"sms",state:"unprepared",testedAt:null}]}});
        await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where tribe_id=${tribeId} and invalidated_at is null`));
        expect((await configure({...body,operationId:randomUUID(),expectedVersion:3})).status).toBe(401);expect(providerRequests).toBe(2);
        const counts=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.messaging_connection_versions where tribe_id=${tribeId}) as versions,(select count(*)::int from public.messaging_secret_envelopes where tribe_id=${tribeId}) as envelopes,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_events where tribe_id=${tribeId}) as usage,(select count(*)::int from public.messaging_usage_policies where tribe_id=${tribeId}) as policies`)).rows[0]);expect(counts).toEqual({versions:3,envelopes:3,deliveries:0,usage:0,policies:0});
      },{preloadModules:[join(process.cwd(),"tests/support/native-zavu-provider-transport.mjs")],environment:{ADMISSION_TEST_ZAVU_CREDENTIAL:credential,ADMISSION_TEST_ZAVU_SENDER_ID:senderId},onProviderRequest:()=>{providerRequests+=1;}}));
    });
  },900_000);
});
