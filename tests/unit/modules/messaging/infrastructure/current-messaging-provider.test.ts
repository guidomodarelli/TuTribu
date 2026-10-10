/** @vitest-environment node */
/** Exercises native provider resolution for a real encrypted candidate with current purpose-bound authority. @module current-messaging-provider-tests */
import {randomBytes,randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {PostgresAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import {PostgresCurrentMessagingProvider} from "@/src/modules/messaging/infrastructure/repositories/postgres-current-messaging-provider";
import {buildMessagingModule} from "@/src/modules/messaging/setup";
import {createRegisteredMessagingAdapters} from "@/src/modules/messaging/infrastructure/composition/messaging-provider-adapters";
import {createAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("native current provider",()=>{
  it("should resolve only the exact live candidate and deny revoked recency or recovery without reading plaintext",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Registro de proveedor",apiKey:randomUUID()});if(created.state!=="completed")throw new Error("Expected encrypted candidate");
      await database.applyMigration("20261006230000_bind_credential_validation_usage.sql");
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000),intentId=randomUUID();
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.context.actorUserId},${fixture.context.sessionId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.tribeId},'validate_messaging_connection',${created.result.id},'/synthetic-provider',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.context.actorUserId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.sessionId},${fixture.context.tribeId},'validate_messaging_connection',${created.result.id},${now},${now},${validUntil})`);
      });
      const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.context.actorUserId,sessionId:fixture.context.sessionId}),(_identity,run)=>database.withContext(fixture.fixture.own,run)),request=buildMessagingModule({accounts,clock:()=>new Date(),execute:(_account,run)=>database.withContext(fixture.fixture.own,run)}).createRequestModule({selection:"management",readSecurityConfig:async()=>fixture.fixture.config});
      const resolved=await request.useCases.resolveContext.execute({tribeId:fixture.context.tribeId,connectionId:created.result.id,operation:"validate_messaging_connection",requestId:randomUUID()});if(!resolved.allowed)throw new Error("Expected current native validation scope");
      let transactions=0;
      const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/me",method:"GET",respond:()=>{expect(transactions).toBe(0);return Response.json({isTestMode:false,apiKey:{id:randomUUID()},project:{id:randomUUID()},team:{id:randomUUID()}});}}]),adapters=createRegisteredMessagingAdapters({execute:async(_context,run)=>{transactions+=1;try{return await database.withContext(fixture.fixture.own,run);}finally{transactions-=1;}},readSecurityFacts:async()=>({environment:fixture.fixture.config.environment,securityEpoch:fixture.fixture.config.securityEpoch,recoveryLocked:false}),fetch:transport.fetch});
      expect(await request.createCredentialValidation(adapters.inspectors).execute({tribeId:fixture.context.tribeId,connectionId:created.result.id,requestId:randomUUID(),operationId:randomUUID(),confirmed:true,expectedVersion:1},new AbortController().signal)).toMatchObject({ok:true,value:{state:"completed",result:{version:2,credentialMode:"production"}}});expect(transport.receipts).toHaveLength(1);
      let recoveryLocked=false;
      const reader=new PostgresCurrentMessagingProvider((_context,run)=>database.withContext(fixture.fixture.own,run),async()=>({environment:fixture.fixture.config.environment,securityEpoch:fixture.fixture.config.securityEpoch,recoveryLocked}));
      expect(await reader.read(resolved.context)).toBe("zavu");await expect(reader.read({...resolved.context,connectionId:randomUUID()})).rejects.toMatchObject({code:"resource_unavailable"});
      recoveryLocked=true;await expect(reader.read(resolved.context)).rejects.toMatchObject({code:"resource_unavailable"});recoveryLocked=false;
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where resource_id=${created.result.id} and invalidated_at is null`));
      await expect(reader.read(resolved.context)).rejects.toMatchObject({code:"reauthentication_required"});
    });
  },300_000);
});
