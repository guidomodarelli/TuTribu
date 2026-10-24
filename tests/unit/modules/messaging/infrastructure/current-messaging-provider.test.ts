/** @vitest-environment node */
/** Exercises native provider resolution for a real encrypted candidate with current purpose-bound authority. @module current-messaging-provider-tests */
import {randomUUID} from "node:crypto";
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
  it("should resolve only the exact live candidate and deny a revoked session binding or recovery without reading plaintext",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Registro de proveedor",apiKey:randomUUID()});if(created.state!=="completed")throw new Error("Expected encrypted candidate");
      await database.applyMigration("20261006230000_bind_credential_validation_usage.sql");
      const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.context.actorUserId,sessionId:fixture.context.sessionId}),(_identity,run)=>database.withContext(fixture.fixture.own,run)),request=buildMessagingModule({accounts,clock:()=>new Date(),execute:(_account,run)=>database.withContext(fixture.fixture.own,run)}).createRequestModule({selection:"management",readSecurityConfig:async()=>fixture.fixture.config});
      const resolved=await request.useCases.resolveContext.execute({tribeId:fixture.context.tribeId,connectionId:created.result.id,operation:"validate_messaging_connection",requestId:randomUUID()});if(!resolved.allowed)throw new Error("Expected current native validation scope");
      let transactions=0;
      const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/me",method:"GET",respond:()=>{expect(transactions).toBe(0);return Response.json({isTestMode:false,apiKey:{id:randomUUID()},project:{id:randomUUID()},team:{id:randomUUID()}});}}]),adapters=createRegisteredMessagingAdapters({execute:async(_context,run)=>{transactions+=1;try{return await database.withContext(fixture.fixture.own,run);}finally{transactions-=1;}},readSecurityFacts:async()=>({environment:fixture.fixture.config.environment,securityEpoch:fixture.fixture.config.securityEpoch,recoveryLocked:false}),fetch:transport.fetch});
      expect(await request.createCredentialValidation(adapters.inspectors).execute({tribeId:fixture.context.tribeId,connectionId:created.result.id,requestId:randomUUID(),operationId:randomUUID(),confirmed:true,expectedVersion:1},new AbortController().signal)).toMatchObject({ok:true,value:{state:"completed",result:{version:2,credentialMode:"production"}}});expect(transport.receipts).toHaveLength(1);
      let recoveryLocked=false;
      const reader=new PostgresCurrentMessagingProvider((_context,run)=>database.withContext(fixture.fixture.own,run),async()=>({environment:fixture.fixture.config.environment,securityEpoch:fixture.fixture.config.securityEpoch,recoveryLocked}));
      expect(await reader.read(resolved.context)).toBe("zavu");await expect(reader.read({...resolved.context,connectionId:randomUUID()})).rejects.toMatchObject({code:"resource_unavailable"});
      recoveryLocked=true;await expect(reader.read(resolved.context)).rejects.toMatchObject({code:"resource_unavailable"});recoveryLocked=false;
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.global_session_identity_bindings set invalidated_at=clock_timestamp() where session_id=${fixture.context.sessionId}`));
      await expect(reader.read(resolved.context)).rejects.toMatchObject({code:"authentication_required"});
    });
  },300_000);
});
