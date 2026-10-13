/** @vitest-environment node */
/** Exercises actual SQL stages, budget/SecretStore and the pinned SDK through an owned HTTP boundary. @module messaging-credential-validation-tests */
import {setTimeout as delay} from "node:timers/promises";
import {MESSAGING_CREDENTIAL_RECOVERY_GRACE_MS} from "@/src/modules/messaging/constants/messaging-credential-validation";
import {randomBytes,randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {createAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";
import {PostgresAdmissionOperationRepository} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import {messagingCredentialValidationSchema} from "@/src/modules/messaging/application/results/messaging-credential-validation-result";
import {PostgresMessagingCredentialValidation} from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-credential-validation";
import {PostgresCredentialValidationBudget} from "@/src/modules/messaging/infrastructure/repositories/postgres-credential-validation-budget";
import {PostgresEncryptedSecretStore} from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import {PostgresAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import {PostgresMessagingAuthorizationReader} from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-authorization-reader";
import {ResolveMessagingContextUseCase} from "@/src/modules/messaging/application/use-cases/resolve-messaging-context-use-case";
import {ReserveMessagingUsageUseCase} from "@/src/modules/messaging/application/use-cases/reserve-messaging-usage-use-case";
import {ValidateMessagingConnectionUseCase} from "@/src/modules/messaging/application/use-cases/validate-messaging-connection-use-case";
import {ZavuConnectionInspector} from "@/src/modules/messaging/infrastructure/zavu/zavu-connection-inspector";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import {buildMessagingModule} from "@/src/modules/messaging/setup";
import {ZavuCredentialInspectorFactory} from "@/src/modules/messaging/infrastructure/zavu/zavu-credential-inspector-factory";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("private credential inspection lifecycle",()=>{
  it.each(["success","stale","expired"]as const)("should bind one outside-SQL inspection to current version/session for %s without another allowance or channel effect",async(scenario)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),credential=`live_${randomUUID()}`;
      await database.applyMigration("20261006230000_bind_credential_validation_usage.sql");
      const creation=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Credencial de prueba",apiKey:credential});
      if(creation.state!=="completed")throw new Error("Expected protected candidate");
      const connectionId=creation.result.id;
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000),intentId=randomUUID();
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.context.actorUserId},${fixture.context.sessionId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.tribeId},'validate_messaging_connection',${connectionId},'/synthetic-validation',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.context.actorUserId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.sessionId},${fixture.context.tribeId},'validate_messaging_connection',${connectionId},${now},${now},${validUntil})`);
      });
      let activeTransactions=0;
      const execute=async<Result>(_context:AuthorizedMessagingContext,run:(transaction:RequestDatabase)=>Promise<Result>):Promise<Result>=>{
        activeTransactions+=1;try{return await database.withContext(fixture.fixture.own,run);}finally{activeTransactions-=1;}
      };
      const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.context.actorUserId,sessionId:fixture.context.sessionId}),(_identity,run)=>database.withContext(fixture.fixture.own,run));
      const resolver={execute:async(command:Parameters<ResolveMessagingContextUseCase["execute"]>[0])=>database.withContext(fixture.fixture.own,(transaction)=>new ResolveMessagingContextUseCase(accounts,new PostgresMessagingAuthorizationReader(transaction,fixture.context.sessionId,"candidate"),{getCurrentSecurityFacts:async()=>({environment:fixture.fixture.config.environment,securityEpoch:fixture.fixture.config.securityEpoch,recoveryLocked:false})},()=>new Date()).execute(command))};
      const privateRefs={apiKeyId:randomUUID(),projectId:randomUUID(),teamId:randomUUID()};
      const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/me",method:"GET",respond:async(request)=>{
        expect(activeTransactions).toBe(0);expect(request.headers.get("Authorization")).toBe(`Bearer ${credential}`);
        if(scenario==="stale")await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.tenant_messaging_connections set name='Nombre actualizado',version=version+1,updated_at=clock_timestamp() where id=${connectionId}`));
        if(scenario==="expired")await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.context.sessionId}`));
        return Response.json({isTestMode:true,apiKey:{id:privateRefs.apiKeyId},project:{id:privateRefs.projectId},team:{id:privateRefs.teamId},ignoredProviderMetadata:{arbitrary:true}});
      }}]);
      const operations=new PostgresMessagingCredentialValidation(execute,async()=>fixture.fixture.config);
      const budget=new ReserveMessagingUsageUseCase(new PostgresCredentialValidationBudget(execute,async()=>fixture.fixture.config),()=>new Date());
      const secrets=new PostgresEncryptedSecretStore((actorUserId,run)=>database.withContext({userId:actorUserId,email:fixture.fixture.own.email},run),accounts,async()=>fixture.fixture.config,"sensitive_leader");
      const useCase=new ValidateMessagingConnectionUseCase(resolver,operations,budget,secrets,{create:(context,key)=>new ZavuConnectionInspector({...context,credential:key},transport.fetch)});
      const input={tribeId:fixture.context.tribeId,connectionId,operationId:randomUUID(),confirmed:true as const,expectedVersion:1,requestId:randomUUID()};
      const result=await useCase.execute(input,new AbortController().signal);
      if(scenario==="success"){
        expect(result).toMatchObject({ok:true,value:{state:"completed",replayed:false,result:{id:connectionId,version:2,configurationVersion:1,credentialState:"valid",credentialMode:"test"}}});
        expect(await useCase.execute(input,new AbortController().signal)).toMatchObject({ok:true,value:{state:"completed",replayed:true}});
      }else expect(result).toMatchObject({ok:false,failure:{code:scenario==="stale"?"connection_conflict":"authentication_required"}});
      expect(transport.receipts).toHaveLength(1);expect(transport.deniedRequests).toBe(0);
      const stored=await database.withContext(fixture.fixture.own,async(transaction)=>({
        facts:(await transaction.execute(sql`select credential_validation_status,is_test_mode,provider_project_ref,provider_team_ref,provider_key_ref from public.messaging_connection_versions where connection_id=${connectionId} and version=1`)).rows[0],
        counts:(await transaction.execute(sql`select (select count(*)::int from public.messaging_usage_events where tribe_id=${input.tribeId} and event_type='credential_validation') as checks,(select count(*)::int from public.messaging_connection_capabilities where tribe_id=${input.tribeId}) as capabilities,(select count(*)::int from public.message_deliveries where tribe_id=${input.tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_policies where tribe_id=${input.tribeId}) as usage`)).rows[0],
        lifecycle:(await transaction.execute(sql`select state,is_selected,is_candidate,version,candidate_version from public.tenant_messaging_connections where id=${connectionId}`)).rows[0],
        results:(await transaction.execute(sql`select public_result from public.academy_admission_operations where tribe_id=${input.tribeId}`)).rows,
      }));
      expect(stored.facts).toEqual(scenario==="success"?{credential_validation_status:"valid",is_test_mode:true,provider_project_ref:privateRefs.projectId,provider_team_ref:privateRefs.teamId,provider_key_ref:privateRefs.apiKeyId}:{credential_validation_status:"not_validated",is_test_mode:null,provider_project_ref:null,provider_team_ref:null,provider_key_ref:null});
      expect(stored.counts).toEqual({checks:1,capabilities:0,deliveries:0,usage:0});
      expect(stored.lifecycle).toEqual({state:"draft",is_selected:false,is_candidate:true,version:scenario==="expired"?1:2,candidate_version:1});
      expect(JSON.stringify(stored.results)).not.toContain(credential);for(const reference of Object.values(privateRefs))expect(JSON.stringify(stored.results)).not.toContain(reference);
    });
  },300_000);

  it("should preserve a native session denial between committed preparation and its private identity lookup before budget or SDK",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database);
      await database.applyMigration("20261006230000_bind_credential_validation_usage.sql");
      const created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Preparación interrumpida",apiKey:randomUUID()});
      if(created.state!=="completed")throw new Error("Expected candidate");
      const connectionId=created.result.id;
      await database.withContext(fixture.fixture.own,async(transaction)=>{
        const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000),intentId=randomUUID();
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.context.actorUserId},${fixture.context.sessionId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.tribeId},'validate_messaging_connection',${connectionId},'/synthetic-validation',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.context.actorUserId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.sessionId},${fixture.context.tribeId},'validate_messaging_connection',${connectionId},${now},${now},${validUntil})`);
      });
      const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.context.actorUserId,sessionId:fixture.context.sessionId}),(_identity,run)=>database.withContext(fixture.fixture.own,run));
      let revoked=false;
      const requestModule=buildMessagingModule({accounts,clock:()=>new Date(),execute:async(_account,run)=>{
        const result=await database.withContext(fixture.fixture.own,run);
        if(!revoked&&typeof result==="object"&&result!==null&&"state"in result&&result.state==="completed"&&"result"in result&&typeof result.result==="object"&&result.result!==null&&"expectedVersion"in result.result){
          revoked=true;await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.context.sessionId}`));
        }
        return result;
      }}).createRequestModule({selection:"management",readSecurityConfig:async()=>fixture.fixture.config});
      const transport=createAdmissionProviderTransport([]),operationId=randomUUID();
      const result=await requestModule.createCredentialValidation(new ZavuCredentialInspectorFactory(transport.fetch)).execute({tribeId:fixture.context.tribeId,connectionId,operationId,expectedVersion:1,confirmed:true,requestId:randomUUID()},new AbortController().signal);
      expect(revoked).toBe(true);expect(result).toMatchObject({ok:false,failure:{code:"authentication_required"}});
      expect(transport.receipts).toHaveLength(0);expect(transport.deniedRequests).toBe(0);
      const counts=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.context.tribeId} and idempotency_key=${operationId} and operation_type='prepare_messaging_credential_validation' and state='completed') as prepared,(select count(*)::int from public.messaging_usage_events where tribe_id=${fixture.context.tribeId} and event_type='credential_validation') as checks`)).rows[0]);
      expect(counts).toEqual({prepared:1,checks:0});
    });
  },300_000);
  it.each(["absent","claimed"] as const)("should close an abandoned reserved inspection for %s final state and freeze the result against late success",async(finalState)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareMessagingConnectionCreation(database),credential=randomUUID();await database.applyMigration("20261006230000_bind_credential_validation_usage.sql");
      const created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Comprobación abandonada",apiKey:credential});if(created.state!=="completed")throw new Error("Expected protected candidate");const connectionId=created.result.id;
      await database.withContext(fixture.fixture.own,async(transaction)=>{const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000),intentId=randomUUID();await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.context.actorUserId},${fixture.context.sessionId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.tribeId},'validate_messaging_connection',${connectionId},'/synthetic-validation-recovery',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.context.actorUserId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.sessionId},${fixture.context.tribeId},'validate_messaging_connection',${connectionId},${now},${now},${validUntil})`);});
      const execute=<Result>(_context:AuthorizedMessagingContext,run:(transaction:RequestDatabase)=>Promise<Result>)=>database.withContext(fixture.fixture.own,run),accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.context.actorUserId,sessionId:fixture.context.sessionId}),(_identity,run)=>database.withContext(fixture.fixture.own,run));
      const resolver={execute:async(command:Parameters<ResolveMessagingContextUseCase["execute"]>[0])=>database.withContext(fixture.fixture.own,(transaction)=>new ResolveMessagingContextUseCase(accounts,new PostgresMessagingAuthorizationReader(transaction,fixture.context.sessionId,"candidate"),{getCurrentSecurityFacts:async()=>({environment:fixture.fixture.config.environment,securityEpoch:fixture.fixture.config.securityEpoch,recoveryLocked:false})},()=>new Date()).execute(command))};
      const input={tribeId:fixture.context.tribeId,connectionId,operationId:randomUUID(),confirmed:true as const,expectedVersion:1,requestId:randomUUID()},authorized=await resolver.execute({...input,operation:"validate_messaging_connection"});if(!authorized.allowed)throw new Error("Expected native validation authority");
      const context=authorized.context,operations=new PostgresMessagingCredentialValidation(execute,async()=>fixture.fixture.config),budget=new ReserveMessagingUsageUseCase(new PostgresCredentialValidationBudget(execute,async()=>fixture.fixture.config),()=>new Date()),prepared=await operations.prepare(context,input);if(prepared.state!=="prepared")throw new Error("Expected committed preparation");expect((await budget.execute({context,operationId:prepared.validationId})).outcome).toBe("reserved");
      if(finalState==="claimed"){
        const command={actorUserId:context.actorUserId,tribeId:context.tribeId,operationType:"validate_messaging_connection",idempotencyKey:input.operationId,intent:{connectionId,expectedVersion:input.expectedVersion,confirmed:input.confirmed}};
        const ledger=new PostgresAdmissionOperationRepository((run)=>database.withContext(fixture.fixture.own,run),async()=>true,async()=>fixture.fixture.config);
        await expect(ledger.run(command,messagingCredentialValidationSchema,async()=>{throw new Error("Synthetic final validation transaction interrupted");})).rejects.toMatchObject({code:"operation_unresolved"});
        const pending=await operations.prepare(context,input);expect(pending.state).toBe("prepared");
      }
      await delay(MESSAGING_CREDENTIAL_RECOVERY_GRACE_MS/2);await delay(MESSAGING_CREDENTIAL_RECOVERY_GRACE_MS/2);
      const transport=createAdmissionProviderTransport([]),secrets=new PostgresEncryptedSecretStore((actorUserId,run)=>database.withContext({userId:actorUserId,email:fixture.fixture.own.email},run),accounts,async()=>fixture.fixture.config,"sensitive_leader"),useCase=new ValidateMessagingConnectionUseCase(resolver,operations,budget,secrets,{create:(scope,key)=>new ZavuConnectionInspector({...scope,credential:key},transport.fetch)});
      const result=await useCase.execute(input,new AbortController().signal);expect(result).toMatchObject({ok:true,value:{state:"completed",replayed:false,result:{id:connectionId,version:2,configurationVersion:1,credentialState:"unavailable",credentialMode:"unknown",failureCode:"dependency_unavailable"}}});expect(transport.receipts).toHaveLength(0);expect(transport.deniedRequests).toBe(0);
      const late=await operations.complete(context,input,prepared.validationId,{ok:true,inspection:{isTestMode:false,apiKeyId:randomUUID(),projectId:randomUUID(),teamId:randomUUID()}});expect(late).toMatchObject({state:"completed",replayed:true,result:{credentialState:"unavailable",failureCode:"dependency_unavailable"}});
      expect(await useCase.execute(input,new AbortController().signal)).toMatchObject({ok:true,value:{state:"completed",replayed:true,result:{credentialState:"unavailable"}}});expect(transport.receipts).toHaveLength(0);
      const stored=await database.withContext(fixture.fixture.own,async(transaction)=>({facts:(await transaction.execute(sql`select credential_validation_status,is_test_mode,provider_project_ref,provider_team_ref,provider_key_ref from public.messaging_connection_versions where connection_id=${connectionId} and version=1`)).rows[0],counts:(await transaction.execute(sql`select (select count(*)::int from public.messaging_usage_events where tribe_id=${fixture.context.tribeId} and event_type='credential_validation') as checks,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.context.tribeId}) as deliveries`)).rows[0]}));expect(stored.facts).toEqual({credential_validation_status:"unavailable",is_test_mode:null,provider_project_ref:null,provider_team_ref:null,provider_key_ref:null});expect(stored.counts).toEqual({checks:1,deliveries:0});
    });
  },600_000);

});
