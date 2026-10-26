/** @vitest-environment node */
/** Exercises local lifecycle routes and original recovery through actual Next/auth/SQL with provider transport closed. @module messaging-lifecycle-native-http-tests */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingConnectionCreation } from "@/tests/support/messaging-connection-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS!=="1")("native local lifecycle HTTP",()=>{
  it("should suspend and disconnect only by explicit scoped consent then recover original metadata without any provider request",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),tribeId=fixture.context.tribeId,slug=`connection-${tribeId}`,credential=randomUUID();
      await database.withContext(fixture.fixture.own,async(transaction)=>{const metadata=(await transaction.execute<{present:boolean}>(sql`select to_regprocedure('public.read_public_admission_overview(text)') is not null as present`)).rows[0];expect(metadata.present).toBe(false);});
      for(const migration of["20261005093000_guard_academy_membership_sources.sql","20261007001000_read_public_admission_overview.sql","20261005100000_guard_messaging_secret_retirement.sql","20261006160000_purge_verification_delivery_material.sql","20261008161500_create_admission_email_settings.sql"])await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own,async(transaction)=>{await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);await transaction.execute(sql`insert into public.admission_email_settings(tribe_id,enabled,enabled_at) values (${tribeId},true,clock_timestamp())`);});
      /** @returns Owned independent settings and absent admission policy, without initializing anything through a read. */
      const independentSettings=()=>database.withContext(fixture.fixture.own,async(transaction)=>({email:(await transaction.execute(sql`select enabled,enabled_at,version from public.admission_email_settings where tribe_id=${tribeId}`)).rows[0],academy:(await transaction.execute(sql`select access_model,admission_enabled from public.tribe_academy_settings where tribe_id=${tribeId}`)).rows[0],policies:(await transaction.execute(sql`select count(*)::int as count from public.academy_admission_policies where tribe_id=${tribeId}`)).rows[0]}));const beforeSettings=await independentSettings();
      let providerRequests=0;
      await database.withServerEnvironment((environment)=>withAdmissionNextServer(environment,slug,async(origin,secret)=>{
        const cookie=encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken,secret)}`),headers={cookie:`better-auth.session_token=${cookie}`,origin,"content-type":"application/json"},base=`${origin}/api/tribes/${slug}/messaging`;
        const creation=await fetch(`${base}/connections`,{method:"POST",headers,body:JSON.stringify({operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Detención local",apiKey:credential})}),created=await creation.json();expect({status:creation.status,code:created.code}).toMatchObject({status:201});expect(await independentSettings()).toEqual(beforeSettings);const connectionId=created.result.id;
        const suspendInput={operationId:randomUUID(),confirmed:true,expectedVersion:1,reason:"security_stop"};
        const foreignOrigin=await fetch(`${base}/connections/${connectionId}/suspend`,{method:"POST",headers:{...headers,origin:"https://foreign.example.invalid"},body:JSON.stringify(suspendInput)});expect(foreignOrigin.status).toBe(403);
        const stop=await fetch(`${base}/connections/${connectionId}/suspend`,{method:"POST",headers,body:JSON.stringify(suspendInput)});expect(stop.status).toBe(200);const stopped=await stop.json();expect(stopped).toMatchObject({state:"completed",operationId:suspendInput.operationId,result:{id:connectionId,state:"suspended",version:2,reason:"security_stop",changed:true}});expect(JSON.stringify(stopped)).not.toContain(credential);
        const stopOriginal=await fetch(`${base}/operations/${suspendInput.operationId}`,{headers});expect(stopOriginal.status).toBe(200);expect(await stopOriginal.json()).toMatchObject({type:"suspend_messaging_connection",state:"completed",result:stopped.result});
        const disconnectInput={operationId:randomUUID(),confirmed:true,expectedVersion:2},retire=await fetch(`${base}/connections/${connectionId}/disconnect`,{method:"POST",headers,body:JSON.stringify(disconnectInput)});expect(retire.status).toBe(200);const retired=await retire.json();expect(retired).toMatchObject({state:"completed",result:{id:connectionId,version:3,state:"disconnected",reason:null,changed:true}});
        const original=await fetch(`${base}/operations/${disconnectInput.operationId}`,{headers});expect(original.status).toBe(200);expect(await original.json()).toMatchObject({type:"disconnect_messaging_connection",state:"completed",result:retired.result});expect(providerRequests).toBe(0);
        const stored=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select state,is_selected,is_candidate,selected_version,candidate_version,retired_at from public.tenant_messaging_connections where id=${connectionId}`)).rows[0]);expect(stored).toMatchObject({state:"disconnected",is_selected:false,is_candidate:false,selected_version:null,candidate_version:null,retired_at:expect.anything()});expect(await independentSettings()).toEqual(beforeSettings);
      },{preloadModules:[join(process.cwd(),"tests/support/native-zavu-provider-transport.mjs")],environment:{ADMISSION_TEST_ZAVU_CREDENTIAL:credential},onProviderRequest:()=>{providerRequests+=1;}}));
    });
  },900_000);
});
