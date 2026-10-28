/** @vitest-environment node */
/** Exercises activation from actual SDK credential/resource checks and locally received diagnostic through native protected PostgreSQL. @module messaging-connection-activation-tests */
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareMessagingConnectionActivation as preparedActivation} from "@/tests/support/messaging-activation-fixture";
import {seedPreviousMessagingSelection} from "@/tests/support/messaging-selection-fixture";
import {createAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";
import {PostgresMessagingCredentialValidation} from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-credential-validation";
import {PostgresCredentialValidationBudget} from "@/src/modules/messaging/infrastructure/repositories/postgres-credential-validation-budget";
import {ZavuCredentialInspectorFactory} from "@/src/modules/messaging/infrastructure/zavu/zavu-credential-inspector-factory";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("native candidate activation",()=>{
  it.each(["invalid","unavailable"] as const)("should preserve an actually selected production connection while checking a %s credential on a separate candidate",async(failure)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await preparedActivation(database);expect(await prepared.owner.activate(prepared.context,prepared.input)).toMatchObject({state:"completed",result:{state:"active"}});
      /** @returns Only the old selected resource's scope and preparation, never credential material or provider administration payloads. */
      const selectedSnapshot=()=>database.withContext(prepared.fixture.fixture.own,async(transaction)=>({connection:(await transaction.execute(sql`select version,state,is_selected,selected_version,is_candidate,candidate_version from public.tenant_messaging_connections where id=${prepared.context.connectionId}`)).rows[0],versions:(await transaction.execute(sql`select version,retired_at,credential_validation_status,credential_validated_at,is_test_mode,email_sender_id from public.messaging_connection_versions where connection_id=${prepared.context.connectionId} order by version`)).rows,capabilities:(await transaction.execute(sql`select channel,state,tested_at,checked_at from public.messaging_connection_capabilities where connection_id=${prepared.context.connectionId} order by channel`)).rows,secrets:(await transaction.execute(sql`select secret_ref,retired_at,purge_after from public.messaging_secret_envelopes where connection_id=${prepared.context.connectionId} order by connection_version`)).rows}));const before=await selectedSnapshot(),created=await prepared.fixture.repository.create(prepared.fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Candidata defectuosa",apiKey:randomUUID()});if(created.state!=="completed")throw new Error("Expected new encrypted candidate");
      const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/me",method:"GET",respond:()=>Response.json({error:"Synthetic unavailable candidate"},{status:failure==="invalid"?401:503})}]),result=await prepared.request.createCredentialValidation(new ZavuCredentialInspectorFactory(transport.fetch)).execute({tribeId:prepared.context.tribeId,connectionId:created.result.id,requestId:randomUUID(),operationId:randomUUID(),confirmed:true,expectedVersion:1},new AbortController().signal);expect(result).toMatchObject({ok:true,value:{state:"completed",result:{failureCode:failure==="invalid"?"invalid_credentials":"dependency_unavailable"}}});expect(transport.receipts).toHaveLength(1);expect(await selectedSnapshot()).toEqual(before);
    });
  },900_000);
  it("should preserve enabled independent email settings when selecting a candidate with an actual prepared email channel",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await preparedActivation(database);await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`insert into public.admission_email_settings(tribe_id,enabled,enabled_at) values (${prepared.context.tribeId},true,clock_timestamp())`));const before=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>({email:(await transaction.execute(sql`select enabled,version,enabled_at from public.admission_email_settings where tribe_id=${prepared.context.tribeId}`)).rows[0],usage:(await transaction.execute(sql`select version,allowed_countries,verification_daily_limit,notification_daily_limit from public.messaging_usage_policies where tribe_id=${prepared.context.tribeId}`)).rows[0]})),requests=prepared.transport.receipts.length;
      expect(await prepared.owner.activate(prepared.context,prepared.input)).toMatchObject({state:"completed",result:{state:"active",version:prepared.input.expectedVersion+1}});const after=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>({email:(await transaction.execute(sql`select enabled,version,enabled_at from public.admission_email_settings where tribe_id=${prepared.context.tribeId}`)).rows[0],usage:(await transaction.execute(sql`select version,allowed_countries,verification_daily_limit,notification_daily_limit from public.messaging_usage_policies where tribe_id=${prepared.context.tribeId}`)).rows[0]}));expect(after).toEqual(before);expect(prepared.transport.receipts).toHaveLength(requests);
    });
  },900_000);
  it("should persist a prepared candidate as ready after its configured channel is locally verified without selecting or enabling admission",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await preparedActivation(database),snapshot=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>({connection:(await transaction.execute(sql`select state,is_selected,is_candidate,selected_version,candidate_version from public.tenant_messaging_connections where id=${prepared.context.connectionId}`)).rows[0],policies:(await transaction.execute<{count:number}>(sql`select count(*)::int as count from public.academy_admission_policies where tribe_id=${prepared.context.tribeId}`)).rows[0].count}));
      expect(snapshot).toEqual({connection:{state:"ready",is_selected:false,is_candidate:true,selected_version:null,candidate_version:2},policies:0});expect(prepared.input.expectedVersion).toBe(4);expect(prepared.transport.receipts).toHaveLength(3);
      expect(await prepared.request.useCases.verifyDiagnostic.execute(prepared.verificationInput)).toMatchObject({ok:true,value:{state:"completed",replayed:true,result:{outcome:"verified"}}});
      const replayedVersion=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>(await transaction.execute<{version:number}>(sql`select version from public.tenant_messaging_connections where id=${prepared.context.connectionId}`)).rows[0].version);expect(replayedVersion).toBe(prepared.input.expectedVersion);
      await expect(prepared.owner.activate(prepared.context,{...prepared.input,operationId:randomUUID(),expectedVersion:prepared.input.expectedVersion-1})).rejects.toMatchObject({code:"connection_conflict"});expect(prepared.transport.receipts).toHaveLength(3);
    });
  },600_000);
  it("should retire ready after an invalid credential result and preserve explicit selection through later preparation checks",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await preparedActivation(database),resolution=await prepared.request.useCases.resolveContext.execute({tribeId:prepared.context.tribeId,connectionId:prepared.context.connectionId,requestId:randomUUID(),operation:"validate_messaging_connection"});if(!resolution.allowed)throw new Error("Expected current credential authority");
      const operations=new PostgresMessagingCredentialValidation(prepared.execute,async()=>prepared.fixture.fixture.config),budget=new PostgresCredentialValidationBudget(prepared.execute,async()=>prepared.fixture.fixture.config);
      const read=()=>database.withContext(prepared.fixture.fixture.own,async(transaction)=>({connection:(await transaction.execute<{version:number;state:string;is_selected:boolean;is_candidate:boolean;selected_version:number|null;candidate_version:number|null}>(sql`select version,state,is_selected,is_candidate,selected_version,candidate_version from public.tenant_messaging_connections where id=${prepared.context.connectionId}`)).rows[0],policies:(await transaction.execute<{count:number}>(sql`select count(*)::int as count from public.academy_admission_policies where tribe_id=${prepared.context.tribeId}`)).rows[0].count}));
      const validate=async(outcome:Parameters<typeof operations.complete>[3])=>{const input={operationId:randomUUID(),confirmed:true as const,expectedVersion:(await read()).connection.version},preparation=await operations.prepare(resolution.context,input);if(preparation.state!=="prepared")throw new Error("Expected new credential preparation");expect(await budget.reserve({context:resolution.context,operationId:preparation.validationId})).toMatchObject({outcome:"reserved"});return{input,result:await operations.complete(resolution.context,input,preparation.validationId,outcome)};};
      const rejected=await validate({ok:false,code:"invalid_credentials"});expect(rejected.result).toMatchObject({state:"completed",result:{failureCode:"invalid_credentials"}});expect(await read()).toEqual({connection:{version:5,state:"draft",is_selected:false,is_candidate:true,selected_version:null,candidate_version:2},policies:0});
      const accepted=await validate({ok:true,inspection:{isTestMode:false,apiKeyId:randomUUID(),projectId:randomUUID(),teamId:randomUUID()}});expect(accepted.result).toMatchObject({state:"completed",result:{credentialState:"valid"}});expect(await read()).toEqual({connection:{version:6,state:"ready",is_selected:false,is_candidate:true,selected_version:null,candidate_version:2},policies:0});
      expect(await operations.read(resolution.context,rejected.input)).toMatchObject({state:"completed",replayed:true,result:{version:5,failureCode:"invalid_credentials"}});expect((await read()).connection.version).toBe(6);
      expect(await prepared.owner.activate(prepared.context,{...prepared.input,expectedVersion:6})).toMatchObject({state:"completed",result:{version:7,state:"active"}});
      await validate({ok:true,inspection:{isTestMode:false,apiKeyId:randomUUID(),projectId:randomUUID(),teamId:randomUUID()}});expect(await read()).toEqual({connection:{version:8,state:"active",is_selected:true,is_candidate:false,selected_version:2,candidate_version:null},policies:0});expect(prepared.transport.receipts).toHaveLength(3);
    });
  },900_000);
  it("should roll back when diagnostic expires during a real delivery lock and then replace only the old selection with fresh evidence",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await preparedActivation(database),previous=await seedPreviousMessagingSelection(database,prepared.fixture,prepared.context.connectionId),before=await previous.snapshot(),beforeRequests=prepared.transport.receipts.length;
      const held=Promise.withResolvers<number>(),release=Promise.withResolvers<void>();let released=false;
      const holding=database.withContext(prepared.fixture.fixture.own,async(transaction)=>{
        await transaction.execute(sql`select id from public.message_deliveries where id=${previous.unused.deliveryId} for update`);
        held.resolve((await transaction.execute<{pid:number}>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
        void release.promise.then(()=>{released=true;});
        while(!released)await transaction.execute(sql`select pg_sleep(0.25)`);
      });
      const holderPid=await held.promise;
      await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_connection_diagnostics set validated_at=clock_timestamp()-interval '24 hours'+interval '60 seconds' where connection_id=${prepared.context.connectionId} and connection_version=${prepared.context.connectionVersion} and outcome='verified'`));
      const outcome=prepared.owner.activate(prepared.context,prepared.input).then((value)=>({status:"fulfilled" as const,value}),(error:unknown)=>({status:"rejected" as const,error}));
      let observedWait=false;
      try{
        for(let attempt=0;attempt<100;attempt+=1){
          const waiting=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>(await transaction.execute<{pid:number}>(sql`select activity.pid from pg_stat_activity activity where activity.wait_event_type='Lock' and ${holderPid}=any(pg_blocking_pids(activity.pid))`)).rows);
          if(waiting.length===1){observedWait=true;break;}await delay(50);
        }
        expect(observedWait).toBe(true);
        await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`select pg_sleep(greatest(0,extract(epoch from(max(validated_at)+interval '24 hours'-clock_timestamp())))+0.1) from public.messaging_connection_diagnostics where connection_id=${prepared.context.connectionId} and connection_version=${prepared.context.connectionVersion} and outcome='verified'`));
      }finally{release.resolve();await holding;}
      expect(await outcome).toMatchObject({status:"rejected",error:{code:"connection_incomplete"}});
      expect(await previous.snapshot()).toEqual(before);
      await database.withContext(prepared.fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_connection_diagnostics set validated_at=clock_timestamp() where connection_id=${prepared.context.connectionId} and connection_version=${prepared.context.connectionVersion} and outcome='verified'`));
      const replacementInput={...prepared.input,operationId:randomUUID()},activated=await prepared.owner.activate(prepared.context,replacementInput);
      expect(activated).toMatchObject({state:"completed",result:{version:prepared.input.expectedVersion+1,configurationVersion:2,state:"active",replaced:{connectionId:previous.connectionId,connectionVersion:1},policyVersion:8}});
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
  it("should audit actual policy reference replacement and only retired available proof with their owner clocks and original activation",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const prepared=await preparedActivation(database),previous=await seedPreviousMessagingSelection(database,prepared.fixture,prepared.context.connectionId,1),before=await previous.snapshot();
      const activated=await prepared.owner.activate(prepared.context,prepared.input);
      expect(activated).toMatchObject({state:"completed",result:{policyVersion:8}});
      const audit=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>({
        policy:(await transaction.execute(sql`select event.metadata,event.actor_user_id,event.rule,event.cause,event.resource_version,event.created_at=policy.updated_at as owner_clock,operation.idempotency_key from public.academy_admission_audit_events event join public.academy_admission_policies policy on policy.tribe_id=event.resource_id and policy.tribe_id=event.tribe_id join public.academy_admission_operations operation on operation.id=event.operation_id and operation.tribe_id=event.tribe_id where event.tribe_id=${prepared.context.tribeId} and event.event_type='messaging_selection_replaced'`)).rows,
        proof:(await transaction.execute(sql`select event.metadata,event.actor_user_id,event.rule,event.cause,event.resource_version,event.created_at=proof.invalidated_at as owner_clock,operation.idempotency_key from public.academy_admission_audit_events event join public.academy_admission_verification_proofs proof on proof.id=event.resource_id and proof.tribe_id=event.tribe_id join public.academy_admission_operations operation on operation.id=event.operation_id and operation.tribe_id=event.tribe_id where event.tribe_id=${prepared.context.tribeId} and event.event_type='proof_invalidated' order by event.metadata->>'challengeId'`)).rows,
      }));
      expect(audit).toEqual({
        policy:[{metadata:{previousVersion:7,previousConnectionId:previous.connectionId,previousConnectionVersion:1,connectionId:prepared.context.connectionId,connectionVersion:2,verificationEpoch:5},actor_user_id:prepared.context.actorUserId,rule:"messaging_connection_replaced",cause:"messaging_connection_replaced",resource_version:8,owner_clock:true,idempotency_key:prepared.input.operationId}],
        proof:[previous.unused,...previous.additionalUnused].map((evidence)=>({metadata:{fromState:"available",toState:"invalid",challengeId:evidence.challengeId,requestId:null,verificationEpoch:5,channel:"email"},actor_user_id:prepared.context.actorUserId,rule:"messaging_connection_replaced",cause:"messaging_connection_replaced",resource_version:null,owner_clock:true,idempotency_key:prepared.input.operationId})).sort((left,right)=>left.metadata.challengeId.localeCompare(right.metadata.challengeId)),
      });
      const after=await previous.snapshot();
      expect(after.proofs.find((proof)=>proof.id===previous.used.proofId)).toEqual(before.proofs.find((proof)=>proof.id===previous.used.proofId));
      expect(after.request).toEqual(before.request);expect(after.usage).toEqual(before.usage);expect(after.reservations).toEqual(before.reservations);
      expect(await prepared.owner.activate(prepared.context,prepared.input)).toMatchObject({state:"completed",replayed:true});
      const replayAudits=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${prepared.context.tribeId} and event_type in ('messaging_selection_replaced','proof_invalidated')`)).rows[0]);
      expect(replayAudits).toEqual({count:3});
    });
  },600_000);
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
      const activated=await prepared.owner.activate(prepared.context,prepared.input);expect(activated).toMatchObject({state:"completed",result:{version:prepared.input.expectedVersion+1,configurationVersion:2,state:"active",replaced:null,policyVersion:null}});
      const audit=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select event.metadata,event.resource_version,event.created_at=connection.updated_at as owner_clock,operation.idempotency_key from public.academy_admission_audit_events event join public.tenant_messaging_connections connection on connection.id=event.resource_id and connection.tribe_id=event.tribe_id join public.academy_admission_operations operation on operation.id=event.operation_id and operation.tribe_id=event.tribe_id where event.resource_id=${prepared.context.connectionId} and event.event_type='activate_messaging_connection'`)).rows);
      expect(audit).toEqual([{metadata:{fromState:"ready",toState:"active",previousVersion:prepared.input.expectedVersion,configurationVersion:2,previousConfigurationVersion:2,channel:null},resource_version:prepared.input.expectedVersion+1,owner_clock:true,idempotency_key:prepared.input.operationId}]);
      expect(await prepared.owner.activate(prepared.context,prepared.input)).toMatchObject({state:"completed",replayed:true,result:activated.state==="completed"?activated.result:undefined});expect(prepared.transport.receipts).toHaveLength(beforeRequests);
      const stored=await database.withContext(prepared.fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select connection.version,connection.is_selected,connection.is_candidate,connection.selected_version,connection.candidate_version,connection.state,usage.version as usage_version,usage.allowed_countries,(select count(*)::int from public.academy_admission_policies where tribe_id=${prepared.context.tribeId}) as admission_policies from public.tenant_messaging_connections connection join public.messaging_usage_policies usage on usage.tribe_id=connection.tribe_id where connection.id=${prepared.context.connectionId}`)).rows[0]);expect(stored).toEqual({version:prepared.input.expectedVersion+1,is_selected:true,is_candidate:false,selected_version:2,candidate_version:null,state:"active",usage_version:1,allowed_countries:[],admission_policies:0});
    });
  },600_000);
});
