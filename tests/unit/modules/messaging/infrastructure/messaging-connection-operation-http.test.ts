/** @vitest-environment node */
/** Exercises the real Next recovery route under actual auth cookies without loading a key, SDK or mutating the original ledger. @module messaging-connection-operation-http-tests */
import {randomUUID} from "node:crypto";
import {join} from "node:path";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {makeSignature} from "better-auth/crypto";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {withAdmissionNextServer} from "@/tests/support/admission-next-server";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS!=="1")("native original connection recovery HTTP",()=>{
  it("should recover its original commit with revoked mutation recency and different unavailable keyrings, preserving leases and current role checks",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),operationId=randomUUID(),credential=randomUUID(),created=await fixture.repository.create(fixture.context,{operationId,confirmed:true,providerId:"zavu",name:"Conexión guardada",apiKey:credential});if(created.state!=="completed")throw new Error("Expected original encrypted commit");
      for(const migration of["20261005092500_guard_messaging_attempts.sql","20261005093000_guard_academy_membership_sources.sql","20261007001000_read_public_admission_overview.sql"])await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own,async(transaction)=>{await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.context.tribeId},'academy',true)`);await transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where tribe_id=${fixture.context.tribeId} and invalidated_at is null`);});
      const snapshot=()=>database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select state,version,lease_owner,lease_until,completed_at,public_result from public.academy_admission_operations where tribe_id=${fixture.context.tribeId} and idempotency_key=${operationId}`)).rows),original=await snapshot();let providerRequests=0;
      await database.withServerEnvironment((environment)=>withAdmissionNextServer(environment,`connection-${fixture.context.tribeId}`,async(origin,secret)=>{
        const cookie=`better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken,secret)}`)}`,path=`${origin}/api/tribes/connection-${fixture.context.tribeId}/messaging/operations/${operationId}`,response=await fetch(path,{headers:{cookie}});
        expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(await response.json()).toEqual({type:"save_messaging_credentials",state:"completed",operationId,replayed:true,result:created.result});expect(providerRequests).toBe(0);expect(await snapshot()).toEqual(original);
        expect((await fetch(`${path}?type=save_messaging_credentials`,{headers:{cookie}})).status).toBe(400);expect((await fetch(path.replace(operationId,randomUUID()),{headers:{cookie}})).status).toBe(404);
        await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.actorUserId}`));
        expect((await fetch(path,{headers:{cookie}})).status).toBe(403);expect(providerRequests).toBe(0);expect(await snapshot()).toEqual(original);
      },{preloadModules:[join(process.cwd(),"tests/support/native-zavu-provider-transport.mjs")],environment:{ADMISSION_TEST_ZAVU_CREDENTIAL:credential},onProviderRequest:()=>{providerRequests+=1;}}));
    });
  },600_000);
});
