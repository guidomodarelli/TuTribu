/** @vitest-environment node */
/** Exercises current audience projections, absence and single usage owner through real SQL/root accounts. @module messaging-configuration-reader-tests */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {PostgresAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import {buildMessagingModule} from "@/src/modules/messaging/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("native configuration projections",()=>{
  it("should read leader absence/candidate/usage without effects and restrict the same account after transfer to guardian alert",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),tribeId=fixture.context.tribeId;
      const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.context.actorUserId,sessionId:fixture.context.sessionId}),(_identity,run)=>database.withContext(fixture.fixture.own,run));
      let recoveryReads=0;
      let currentEpoch=fixture.fixture.config.securityEpoch;
      const reader=buildMessagingModule({accounts,clock:()=>new Date(),execute:(_account,run)=>database.withContext(fixture.fixture.own,run)}).createConfigurationModule({readSecurityFacts:async()=>{recoveryReads+=1;return{environment:fixture.fixture.config.environment,securityEpoch:currentEpoch,recoveryLocked:false};}}).useCases;
      const query={tribeId,requestId:randomUUID()};
      expect(await reader.execute(query)).toMatchObject({ok:true,value:{audience:"leader",selected:null,candidate:null,usage:{state:"not_configured",policy:null}}});
      const created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Candidata privada",apiKey:randomUUID()});
      if(created.state!=="completed")throw new Error("Expected candidate");
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,allowed_countries,verification_daily_limit,notification_daily_limit) values (${tribeId},ARRAY['AR'],0,0)`);
        await transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where tribe_id=${tribeId}`);
      });
      const snapshot=await reader.execute(query);
      expect(snapshot).toMatchObject({ok:true,value:{audience:"leader",selected:null,candidate:{id:created.result.id,name:"Candidata privada",version:1,configurationVersion:1,state:"draft",credentialState:"not_validated",credentialMode:"unknown",maskedCredential:"••••••••",capabilities:[]},usage:{state:"configured",policy:{version:1,allowedCountries:["AR"],verificationDailyLimit:0,notificationDailyLimit:0,consumption:{verificationToday:0,notificationToday:0}}}}});
      expect(recoveryReads).toBe(0);
      const guardianUserId=randomUUID(),guardianSessionId=randomUUID(),guardianPrincipal={userId:guardianUserId,email:`${guardianUserId}@example.test`};
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${guardianUserId},'Synthetic current guardian',${guardianPrincipal.email},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${guardianSessionId},${guardianUserId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${guardianUserId},'guardian','active')`);
      });
      const guardianAccounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:guardianUserId,sessionId:guardianSessionId}),(_identity,run)=>database.withContext(guardianPrincipal,run));
      const guardianReader=buildMessagingModule({accounts:guardianAccounts,clock:()=>new Date(),execute:(_account,run)=>database.withContext(guardianPrincipal,run)}).createConfigurationModule({readSecurityFacts:async()=>({environment:fixture.fixture.config.environment,securityEpoch:currentEpoch,recoveryLocked:false})}).useCases;
      expect(await guardianReader.execute(query)).toEqual({ok:true,value:{audience:"guardian",operationalAlert:"not_configured"}});
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        await transaction.execute(sql`update public.tenant_messaging_connections set is_candidate=false,is_selected=true,selected_version=1,candidate_version=null,state='active',version=version+1 where id=${created.result.id}`);
        await transaction.execute(sql`update public.messaging_connection_versions set credential_validation_status='valid',is_test_mode=false,credential_validated_at=clock_timestamp() where connection_id=${created.result.id}`);
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,state,checked_at,tested_at) values (${tribeId},${created.result.id},1,'email',${randomUUID()},'prepared',clock_timestamp(),clock_timestamp())`);
      });
      expect(await guardianReader.execute(query)).toEqual({ok:true,value:{audience:"guardian",operationalAlert:"available"}});
      currentEpoch=randomUUID();
      expect(await guardianReader.execute(query)).toEqual({ok:true,value:{audience:"guardian",operationalAlert:"attention_required"}});
      currentEpoch=fixture.fixture.config.securityEpoch;
      expect(await guardianReader.execute(query)).toEqual({ok:true,value:{audience:"guardian",operationalAlert:"available"}});
      const nextLeader=randomUUID();
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${nextLeader},'Synthetic next leader',${`${nextLeader}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${tribeId} and user_id=${fixture.context.actorUserId}`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${nextLeader},'leader','active')`);
      });
      expect(await reader.execute(query)).toEqual({ok:true,value:{audience:"guardian",operationalAlert:"attention_required"}});
      expect(recoveryReads).toBe(1);
      expect(await guardianReader.execute(query)).toEqual({ok:true,value:{audience:"guardian",operationalAlert:"attention_required"}});
      expect(await reader.execute(query)).toEqual({ok:true,value:{audience:"guardian",operationalAlert:"attention_required"}});
      currentEpoch=randomUUID();
      expect(await reader.execute(query)).toEqual({ok:true,value:{audience:"guardian",operationalAlert:"attention_required"}});
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set status='muted' where tribe_id=${tribeId} and user_id=${fixture.context.actorUserId}`));
      expect(await reader.execute(query)).toMatchObject({ok:false,failure:{code:"permission_denied"}});
      const counts=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${tribeId}) as operations,(select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_events where tribe_id=${tribeId}) as events,(select version from public.messaging_usage_policies where tribe_id=${tribeId}) as usage_version`)).rows[0]);
      expect(counts).toEqual({operations:1,deliveries:0,events:0,usage_version:1});
    });
  },240_000);
});
