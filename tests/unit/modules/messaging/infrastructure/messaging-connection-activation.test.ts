/** @vitest-environment node */
/** Exercises activation from actual SDK credential/resource checks and locally received diagnostic through native protected PostgreSQL. @module messaging-connection-activation-tests */
import {randomBytes,randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase,type AcademyAdmissionTestDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionCreation} from "@/tests/support/messaging-connection-fixture";
import {seedPreviousMessagingSelection} from "@/tests/support/messaging-selection-fixture";
import {createAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";
import {PostgresAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import {PostgresMessagingConnectionActivation} from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-activation";
import {PostgresMessagingSelectionDependencies} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-messaging-selection-dependencies";
import {ZavuCredentialInspectorFactory} from "@/src/modules/messaging/infrastructure/zavu/zavu-credential-inspector-factory";
import {ZavuMessageDeliverySender} from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import {ScopedConnectionDiagnosticDispatcher} from "@/src/modules/messaging/infrastructure/composition/connection-diagnostic-dispatcher";
import {buildMessagingModule,buildMessagingWorkModule} from "@/src/modules/messaging/setup";
import {VERIFICATION_MESSAGE_COPY} from "@/src/modules/messaging/constants/zavu-delivery";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

/** @param database - Owned branch. @returns Real configuration/validation/diagnostic evidence and the exact activation context without external network. */
async function preparedActivation(database:AcademyAdmissionTestDatabase){
  const fixture=await prepareMessagingConnectionCreation(database),credential=randomUUID(),senderId=randomUUID();
  for(const migration of["20261005092500_guard_messaging_attempts.sql","20261005100000_guard_messaging_secret_retirement.sql","20261006120000_index_messaging_contact_windows.sql","20261006140000_claim_messaging_deliveries_fairly.sql","20261006160000_purge_verification_delivery_material.sql","20261006230000_bind_credential_validation_usage.sql","20261007050000_claim_scoped_diagnostic_delivery.sql"])await database.applyMigration(migration);
  const created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Activación real",apiKey:credential});if(created.state!=="completed")throw new Error("Expected protected candidate");
  await database.withContext(fixture.fixture.own,async(transaction)=>{
    const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000);
    await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id) values (${fixture.context.tribeId})`);
    for(const operation of["configure_messaging_connection","validate_messaging_connection","diagnose_messaging_connection","verify_messaging_diagnostic","activate_messaging_connection"]){const intentId=randomUUID();await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.context.actorUserId},${fixture.context.sessionId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.tribeId},${operation},${created.result.id},'/synthetic-activation',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.context.actorUserId},${fixture.context.accountId},${fixture.context.subject},${fixture.context.sessionId},${fixture.context.tribeId},${operation},${created.result.id},${now},${now},${validUntil})`);}
  });
  let code="",transactions=0;
  const execute=async<Result>(_context:{actorUserId:string},run:(database:RequestDatabase)=>Promise<Result>)=>{transactions+=1;try{return await database.withContext(fixture.fixture.own,run);}finally{transactions-=1;}};
  const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.context.actorUserId,sessionId:fixture.context.sessionId}),(_identity,run)=>execute(fixture.context,run));
  const request=buildMessagingModule({accounts,clock:()=>new Date(),execute:(_account,run)=>execute(fixture.context,run)}).createRequestModule({selection:"management",readSecurityConfig:async()=>fixture.fixture.config});
  const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:`/v1/senders/${senderId}`,method:"GET",respond:()=>Response.json({id:senderId,name:"Remitente",channels:["email"]})},{origin:"https://api.zavu.dev",pathname:"/v1/me",method:"GET",respond:()=>Response.json({isTestMode:false,apiKey:{id:randomUUID()},project:{id:randomUUID()},team:{id:randomUUID()}})},{origin:"https://api.zavu.dev",pathname:"/v1/messages",method:"POST",respond:async(incoming)=>{expect(transactions).toBe(0);const body=await incoming.json() as{text:string};code=body.text.slice(VERIFICATION_MESSAGE_COPY.prefix.length,-VERIFICATION_MESSAGE_COPY.suffix.length);return Response.json({message:{id:randomUUID(),direction:"outbound",channel:"email",status:"sent"}});}}]);
  const inspectors=new ZavuCredentialInspectorFactory(transport.fetch),base={tribeId:fixture.context.tribeId,connectionId:created.result.id,requestId:randomUUID()};
  expect(await request.createConnectionConfiguration(inspectors).execute({...base,operationId:randomUUID(),confirmed:true,expectedVersion:1,channel:"email",senderId},new AbortController().signal)).toMatchObject({ok:true,value:{state:"completed",result:{version:2,configurationVersion:2}}});
  expect(await request.createCredentialValidation(inspectors).execute({...base,operationId:randomUUID(),confirmed:true,expectedVersion:2},new AbortController().signal)).toMatchObject({ok:true,value:{state:"completed",result:{version:3,credentialMode:"production"}}});
  const deferred:Promise<void>[]=[],dispatcher=new ScopedConnectionDiagnosticDispatcher({readSecurityFacts:async()=>({environment:fixture.fixture.config.environment,securityEpoch:fixture.fixture.config.securityEpoch,recoveryLocked:false}),createDispatcher:(diagnosticScope,authorize)=>buildMessagingWorkModule({diagnosticScope,authorize,execute:(_actor,run)=>execute(fixture.context,run),readSecurityConfig:async()=>fixture.fixture.config,createSender:(preparation)=>new ZavuMessageDeliverySender(preparation,transport.fetch),runtime:{now:Date.now,createId:randomUUID,defer:(work)=>{deferred.push(work);},report:()=>{throw new Error("Unexpected diagnostic failure");}}}).useCases.dispatch});
  const issued=await request.createDiagnosticIssuance(dispatcher).execute({...base,operationId:randomUUID(),confirmed:true,expectedVersion:3,channel:"email",recipient:fixture.fixture.own.email});if(!issued.ok||issued.value.state!=="completed"||issued.value.result.outcome!=="issued")throw new Error("Expected real diagnostic issuance");await Promise.all(deferred);
  expect(await request.useCases.verifyDiagnostic.execute({...base,diagnosticId:issued.value.result.diagnosticId,operationId:randomUUID(),code})).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"verified"}}});
  const resolved=await request.useCases.resolveContext.execute({...base,operation:"activate_messaging_connection"});if(!resolved.allowed)throw new Error("Expected current activation authority");
  const owner=new PostgresMessagingConnectionActivation(execute,async()=>fixture.fixture.config,(transaction)=>new PostgresMessagingSelectionDependencies(transaction));
  return{fixture,transport,owner,context:resolved.context,input:{operationId:randomUUID(),expectedVersion:3,confirmed:true as const}};
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("native candidate activation",()=>{
  it("should roll back when diagnostic expires during a real delivery lock and then replace only the old selection with fresh evidence",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await preparedActivation(database),previous=await seedPreviousMessagingSelection(database,prepared.fixture,prepared.context.connectionId),before=await previous.snapshot(),beforeRequests=prepared.transport.receipts.length;
      const held=Promise.withResolvers<number>(),started=Promise.withResolvers<number>(),release=Promise.withResolvers<void>();let released=false;
      const holding=database.withContext(prepared.fixture.fixture.own,async(transaction)=>{
        await transaction.execute(sql`select id from public.message_deliveries where id=${previous.unused.deliveryId} for update`);
        held.resolve((await transaction.execute<{pid:number}>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
        release.promise.then(()=>{released=true;});
        while(!released)await transaction.execute(sql`select pg_sleep(0.25)`);
      });
      const holderPid=await held.promise;
      await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_connection_diagnostics set validated_at=clock_timestamp()-interval '24 hours'+interval '60 seconds' where connection_id=${prepared.context.connectionId} and connection_version=${prepared.context.connectionVersion} and outcome='verified'`));
      const owner=new PostgresMessagingConnectionActivation((_context,run)=>database.withContext(prepared.fixture.fixture.own,async(transaction)=>{
        started.resolve((await transaction.execute<{pid:number}>(sql`select pg_backend_pid() as pid`)).rows[0].pid);return run(transaction);
      }),async()=>prepared.fixture.fixture.config,(transaction)=>new PostgresMessagingSelectionDependencies(transaction));
      const outcome=owner.activate(prepared.context,prepared.input).then((value)=>({status:"fulfilled" as const,value}),(error:unknown)=>({status:"rejected" as const,error})),activationPid=await started.promise;
      let observedWait=false;
      try{
        for(let attempt=0;attempt<100;attempt+=1){
          const blockers=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>(await transaction.execute<{blockers:number[]}>(sql`select pg_blocking_pids(${activationPid}) as blockers`)).rows[0].blockers);
          if(blockers.includes(holderPid)){observedWait=true;break;}await delay(50);
        }
        expect(observedWait).toBe(true);
        await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`select pg_sleep(greatest(0,extract(epoch from(max(validated_at)+interval '24 hours'-clock_timestamp())))+0.1) from public.messaging_connection_diagnostics where connection_id=${prepared.context.connectionId} and connection_version=${prepared.context.connectionVersion} and outcome='verified'`));
      }finally{release.resolve();await holding;}
      expect(await outcome).toMatchObject({status:"rejected",error:{code:"connection_incomplete"}});
      expect(await previous.snapshot()).toEqual(before);
      await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_connection_diagnostics set validated_at=clock_timestamp() where connection_id=${prepared.context.connectionId} and connection_version=${prepared.context.connectionVersion} and outcome='verified'`));
      const replacementInput={...prepared.input,operationId:randomUUID()},activated=await prepared.owner.activate(prepared.context,replacementInput);
      expect(activated).toMatchObject({state:"completed",result:{version:4,configurationVersion:2,state:"active",replaced:{connectionId:previous.connectionId,connectionVersion:1},policyVersion:8}});
      const after=await previous.snapshot();
      expect(after.policy).toEqual({...before.policy,version:8,messaging_connection_id:prepared.context.connectionId,messaging_connection_version:2});
      expect(after.request).toEqual(before.request);expect(after.usage).toEqual(before.usage);expect(after.reservations).toEqual(before.reservations);
      expect(after.proofs.find((proof)=>proof.id===previous.used.proofId)).toEqual(before.proofs.find((proof)=>proof.id===previous.used.proofId));
      expect(after.proofs.find((proof)=>proof.id===previous.unused.proofId)).toMatchObject({status:"invalid",applied_request_id:null,invalidation_reason:"messaging_connection_replaced"});
      expect(after.challenges).toEqual(before.challenges.map((challenge)=>({...challenge,is_current:false,version:Number(challenge.version)+1,invalidated_at:expect.anything(),invalidation_reason:"messaging_connection_replaced"})));
      for(const deliveryId of[previous.acceptedDeliveryId,previous.unknownDeliveryId])expect(after.deliveries.find((delivery)=>delivery.id===deliveryId)).toEqual(before.deliveries.find((delivery)=>delivery.id===deliveryId));
      for(const evidence of[previous.used,previous.unused])expect(after.deliveries.find((delivery)=>delivery.id===evidence.deliveryId)).toMatchObject({state:"cancelled",last_outcome:"connection_replaced",connection_id:previous.connectionId,connection_version:1});
      expect(after.connections.find((connection)=>connection.id===previous.connectionId)).toMatchObject({state:"disconnected",is_selected:false,selected_version:null,retired_at:expect.anything()});
      expect(after.versions.find((version)=>version.connection_id===previous.connectionId)).toMatchObject({retired_at:expect.anything(),purge_after:expect.anything()});
      expect(after.secrets.find((secret)=>secret.connection_id===previous.connectionId)).toMatchObject({retired_at:expect.anything(),purge_after:expect.anything()});
      expect(await prepared.owner.activate(prepared.context,replacementInput)).toMatchObject({state:"completed",replayed:true,result:activated.state==="completed"?activated.result:undefined});
      expect(await previous.snapshot()).toEqual(after);expect(prepared.transport.receipts).toHaveLength(beforeRequests);
    });
  },900_000);
  it("should activate only the locally tested production candidate, replay without writes or RPC and preserve usage/admission defaults",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await preparedActivation(database),beforeRequests=prepared.transport.receipts.length;
      await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_connection_versions set is_test_mode=true where connection_id=${prepared.context.connectionId} and version=${prepared.context.connectionVersion}`));
      await expect(prepared.owner.activate(prepared.context,{...prepared.input,operationId:randomUUID()})).rejects.toMatchObject({code:"connection_incomplete"});
      await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_connection_versions set is_test_mode=false where connection_id=${prepared.context.connectionId} and version=${prepared.context.connectionVersion}`));
      const originalDiagnosticTime=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>(await transaction.execute<{validated_at:Date|string}>(sql`select validated_at from public.messaging_connection_diagnostics where connection_id=${prepared.context.connectionId} and connection_version=${prepared.context.connectionVersion} and outcome='verified'`)).rows[0].validated_at);
      await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_connection_diagnostics set validated_at=clock_timestamp()-interval '25 hours' where connection_id=${prepared.context.connectionId} and connection_version=${prepared.context.connectionVersion} and outcome='verified'`));
      await expect(prepared.owner.activate(prepared.context,{...prepared.input,operationId:randomUUID()})).rejects.toMatchObject({code:"connection_incomplete"});
      await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_connection_diagnostics set validated_at=${originalDiagnosticTime} where connection_id=${prepared.context.connectionId} and connection_version=${prepared.context.connectionVersion} and outcome='verified'`));
      const activated=await prepared.owner.activate(prepared.context,prepared.input);expect(activated).toMatchObject({state:"completed",result:{version:4,configurationVersion:2,state:"active",replaced:null,policyVersion:null}});
      expect(await prepared.owner.activate(prepared.context,prepared.input)).toMatchObject({state:"completed",replayed:true,result:activated.state==="completed"?activated.result:undefined});expect(prepared.transport.receipts).toHaveLength(beforeRequests);
      const stored=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select connection.version,connection.is_selected,connection.is_candidate,connection.selected_version,connection.candidate_version,connection.state,usage.version as usage_version,usage.allowed_countries,(select count(*)::int from public.academy_admission_policies where tribe_id=${prepared.context.tribeId}) as admission_policies from public.tenant_messaging_connections connection join public.messaging_usage_policies usage on usage.tribe_id=connection.tribe_id where connection.id=${prepared.context.connectionId}`)).rows[0]);expect(stored).toEqual({version:4,is_selected:true,is_candidate:false,selected_version:2,candidate_version:null,state:"active",usage_version:1,allowed_countries:[],admission_policies:0});
    });
  },600_000);
});
