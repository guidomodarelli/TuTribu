/** @vitest-environment node */
/** Exercises the actual Next/Better Auth/SDK credential route with an owned closed provider transport. @module messaging-credential-validation-http-tests */
import {randomUUID} from "node:crypto";
import {join} from "node:path";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {makeSignature} from "better-auth/crypto";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {withAdmissionNextServer} from "@/tests/support/admission-next-server";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS!=="1")("native credential validation HTTP",()=>{
  it("should inspect once and replay the original metadata without exposing private references or preparing a channel",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),tribeId=fixture.context.tribeId,slug=`connection-${tribeId}`,credential=`live_${randomUUID()}`;
      for(const migration of["20261005093000_guard_academy_membership_sources.sql","20261007001000_read_public_admission_overview.sql","20261006230000_bind_credential_validation_usage.sql"])await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));
      let providerRequests=0;
      await database.withServerEnvironment((environment)=>withAdmissionNextServer(environment,slug,async(origin,secret)=>{
        const cookie=`better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken,secret)}`)}`;
        const headers={cookie,origin,"content-type":"application/json"};
        const configurationPath=`${origin}/api/tribes/${slug}/messaging/configuration`;
        const absent=await fetch(configurationPath,{headers:{cookie}});expect(absent.status).toBe(200);expect(await absent.json()).toEqual({audience:"leader",selected:null,candidate:null,usage:{state:"not_configured",policy:null}});expect(providerRequests).toBe(0);
        const create=await fetch(`${origin}/api/tribes/${slug}/messaging/connections`,{method:"POST",headers,body:JSON.stringify({operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Credencial nativa",apiKey:credential})});
        expect(create.status).toBe(201);const created=await create.json(),connectionId=created.result.id;
        const path=`${origin}/api/tribes/${slug}/messaging/connections/${connectionId}/validate`,body={operationId:randomUUID(),confirmed:true,expectedVersion:1};
        const validate=(input:unknown=body)=>fetch(path,{method:"POST",headers,body:JSON.stringify(input)});
        const first=await validate();expect(first.status).toBe(200);const initial=await first.json();
        expect(initial).toMatchObject({state:"completed",replayed:false,result:{id:connectionId,version:2,configurationVersion:1,credentialState:"valid",credentialMode:"test"}});
        expect(JSON.stringify(initial)).not.toContain(credential);expect(providerRequests).toBe(1);
        const replay=await validate();expect(replay.status).toBe(200);expect(await replay.json()).toMatchObject({replayed:true,result:initial.result});expect(providerRequests).toBe(1);
        const current=await fetch(configurationPath,{headers:{cookie}});expect(current.status).toBe(200);expect(await current.json()).toMatchObject({audience:"leader",selected:null,candidate:{id:connectionId,version:2,configurationVersion:1,state:"draft",credentialState:"valid",credentialMode:"test",maskedCredential:"••••••••",capabilities:[]},usage:{state:"not_configured",policy:null}});expect(providerRequests).toBe(1);
        expect((await validate({...body,expectedVersion:2})).status).toBe(409);expect(providerRequests).toBe(1);
        expect((await validate({...body,operationId:randomUUID()})).status).toBe(409);expect(providerRequests).toBe(1);
        await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.context.sessionId}`));
        expect((await validate()).status).toBe(401);expect(providerRequests).toBe(1);
        const resourcesPath=`${origin}/api/tribes/${slug}/messaging/connections/${connectionId}`;
        expect((await fetch(`${resourcesPath}/senders`,{headers:{cookie}})).status).toBe(401);expect(providerRequests).toBe(1);
        await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '1 hour' where id=${fixture.context.sessionId}`));
        expect((await fetch(configurationPath,{headers:{cookie}})).status).toBe(200);expect(providerRequests).toBe(1);
        for(const kind of["senders","templates"]){
          const response=await fetch(`${resourcesPath}/${kind}?limit=1`,{headers:{cookie}});expect(response.status).toBe(200);const page=await response.json();
          expect(page).toMatchObject({connectionId,configurationVersion:1,items:[{label:kind==="senders"?"Remitente de prueba":"Código de prueba",channels:[kind==="senders"?"email":"whatsapp"],readiness:"ready"}]});
          expect(page.items).toHaveLength(1);expect(page.nextCursor).toBeUndefined();expect(JSON.stringify(page)).not.toContain(credential);expect(page.items[0]).not.toHaveProperty("webhook");expect(page.items[0]).not.toHaveProperty("body");if(kind==="templates")expect(page.items[0].language).toBe("es");
        }
        expect(providerRequests).toBe(5);
        expect((await fetch(`${resourcesPath}/senders?role=leader`,{headers:{cookie}})).status).toBe(400);expect(providerRequests).toBe(5);
        await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.global_session_identity_bindings set invalidated_at=clock_timestamp() where session_id=${fixture.context.sessionId}`));
        expect((await fetch(`${resourcesPath}/templates`,{headers:{cookie}})).status).toBe(401);expect(providerRequests).toBe(5);
        const stored=await database.withContext(fixture.fixture.own,async(transaction)=>({
          facts:(await transaction.execute<{provider_project_ref:string;provider_team_ref:string;provider_key_ref:string}>(sql`select provider_project_ref,provider_team_ref,provider_key_ref from public.messaging_connection_versions where connection_id=${connectionId} and version=1`)).rows[0],
          counts:(await transaction.execute(sql`select (select count(*)::int from public.messaging_usage_events where tribe_id=${tribeId} and event_type='credential_validation') as checks,(select count(*)::int from public.messaging_connection_capabilities where tribe_id=${tribeId}) as capabilities,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_policies where tribe_id=${tribeId}) as usage`)).rows[0],
        }));
        expect(stored.counts).toEqual({checks:1,capabilities:0,deliveries:0,usage:0});for(const reference of Object.values(stored.facts)){expect(reference).toEqual(expect.any(String));expect(JSON.stringify(initial)).not.toContain(reference);}
      },{preloadModules:[join(process.cwd(),"tests/support/native-zavu-provider-transport.mjs")],environment:{ADMISSION_TEST_ZAVU_CREDENTIAL:credential,ADMISSION_TEST_ZAVU_RESOURCES:"1"},onProviderRequest:()=>{providerRequests+=1;}}));
    });
  },720_000);
});
