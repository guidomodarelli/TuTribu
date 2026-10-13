/** @vitest-environment node */
/** Exercises original connection recovery through native roots and actual encrypted creation without a keyring read or lease renewal. @module messaging-connection-operation-reader-tests */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {PostgresAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import {buildMessagingModule} from "@/src/modules/messaging/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("native original connection recovery",()=>{
  it("should read only its actor's original commit without recency, keys or another write and deny withdrawn leadership",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),operationId=randomUUID(),created=await fixture.repository.create(fixture.context,{operationId,confirmed:true,providerId:"zavu",name:"Recuperación original",apiKey:randomUUID()});if(created.state!=="completed")throw new Error("Expected encrypted candidate commit");
      const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.context.actorUserId,sessionId:fixture.context.sessionId}),(_identity,run)=>database.withContext(fixture.fixture.own,run)),operation=buildMessagingModule({accounts,clock:()=>new Date(),execute:(_account,run)=>database.withContext(fixture.fixture.own,run)}).createConnectionOperationReadModule().useCases,query={tribeId:fixture.context.tribeId,operationId,requestId:randomUUID()};
      const snapshot=()=>database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select state,version,lease_owner,lease_until,completed_at,public_result from public.academy_admission_operations where tribe_id=${query.tribeId} and actor_user_id=${fixture.context.actorUserId} and idempotency_key=${operationId}`)).rows);
      const original=await snapshot();await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where tribe_id=${query.tribeId} and invalidated_at is null`));
      expect(await operation.execute(query)).toMatchObject({ok:true,value:{type:"save_messaging_credentials",state:"completed",operationId,replayed:true,result:created.result}});expect(await snapshot()).toEqual(original);
      expect(await operation.execute({...query,operationId:randomUUID()})).toMatchObject({ok:false,failure:{code:"resource_unavailable"}});
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${query.tribeId} and user_id=${fixture.context.actorUserId}`));
      expect(await operation.execute(query)).toMatchObject({ok:false,failure:{code:"permission_denied"}});expect(await snapshot()).toEqual(original);
    });
  },300_000);
});
