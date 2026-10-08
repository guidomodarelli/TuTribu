/** @vitest-environment node */
/** Exercises actual account/recency/issuer/budgets/marker/SecretStore/SDK and local diagnostic proof isolation. @module diagnostic-issue-workflow-tests */
import {randomBytes,randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase,type AcademyAdmissionTestDatabase} from "@/tests/support/academy-admission-database";
import {prepareContactVerificationIssuer,advanceVerificationRequestCooldown} from "@/tests/support/contact-verification-issuance-fixture";
import {createAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";
import {PostgresAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import {buildMessagingModule,buildMessagingWorkModule} from "@/src/modules/messaging/setup";
import {ScopedConnectionDiagnosticDispatcher} from "@/src/modules/messaging/infrastructure/composition/connection-diagnostic-dispatcher";
import {ZavuMessageDeliverySender} from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import {VERIFICATION_MESSAGE_COPY} from "@/src/modules/messaging/constants/zavu-delivery";
import {PostgresMessageDeliveryReader} from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-reader";
import {connectionDiagnosticIssuanceSchema} from "@/src/modules/messaging/application/results/connection-diagnostic-issuance-result";
import {VERIFICATION_ISSUANCE_OPERATION} from "@/src/modules/academy-admissions/constants/verification-issuance";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {MessagingDispatchDiagnostic} from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import {PostgresMessagingConnectionConfiguration} from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-configuration";

/** @param database - Owned disposable branch. @param phone - Whether to exercise required country configuration. @param alternativePhoneChannel - Whether the closed transport accepts explicit SMS/WhatsApp replacement. @returns Actual native account/recency and implemented request/work roots without any provider network. */
async function workflowFixture(database:AcademyAdmissionTestDatabase,phone=false,alternativePhoneChannel=false){
  const fixture=await prepareContactVerificationIssuer(database,"connection_diagnostic",phone);
  for(const migration of["20261005092500_guard_messaging_attempts.sql","20261005095000_guard_global_identity_context.sql","20261005100000_guard_messaging_secret_retirement.sql","20261006140000_claim_messaging_deliveries_fairly.sql","20261006160000_purge_verification_delivery_material.sql","20261007050000_claim_scoped_diagnostic_delivery.sql"])await database.applyMigration(migration);
  const sessionId=randomUUID(),accountId=randomUUID(),subject=randomUUID();
  await database.withContext(fixture.own,async(transaction)=>{
    const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},${new Date(now.getTime()+3_600_000)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
    for(const operation of["diagnose_messaging_connection","verify_messaging_diagnostic","configure_messaging_connection","update_messaging_usage"]){const intentId=randomUUID(),resourceId=operation==="update_messaging_usage"?fixture.scope.tribeId:fixture.scope.connectionId;await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${fixture.scope.tribeId},${operation},${resourceId},'/synthetic-diagnostic-workflow',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${fixture.scope.tribeId},${operation},${resourceId},${now},${now},${validUntil})`);}
  });
  let transactions=0,sentCode="";
  const withActor=async<Result>(userId:string|null,run:(database:RequestDatabase)=>Promise<Result>)=>{transactions+=1;try{return await database.withContext({userId,email:userId===fixture.userId?fixture.own.email:null},run);}finally{transactions-=1;}};
  const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.userId,sessionId}),(_identity,run)=>withActor(fixture.userId,run));
  const messagingModule=buildMessagingModule({accounts,clock:()=>new Date(),execute:(account,run)=>withActor(account.userId,run)}),request=messagingModule.createRequestModule({selection:"management",readSecurityConfig:async()=>fixture.config});
  const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/messages",method:"POST",respond:async(incoming)=>{
    expect(transactions).toBe(0);expect(incoming.headers.get("Authorization")).toBe(`Bearer ${fixture.credential}`);
    const body=await incoming.json() as{channel:string;text?:string;content?:{templateVariables?:Record<string,string>};fallbackEnabled:boolean;idempotencyKey:string};expect(body.fallbackEnabled).toBe(false);expect(alternativePhoneChannel?["sms","whatsapp"]:[fixture.scope.channel]).toContain(body.channel);sentCode=body.channel==="whatsapp"?body.content?.templateVariables?.["1"]??"":body.text?.slice(VERIFICATION_MESSAGE_COPY.prefix.length,-VERIFICATION_MESSAGE_COPY.suffix.length)??"";expect(sentCode).toMatch(/^\d{6}$/u);
    return Response.json({message:{id:randomUUID(),direction:"outbound",channel:body.channel,status:"sent"}});
  }}]);
  const deferred:Promise<void>[]=[],diagnostics:MessagingDispatchDiagnostic[]=[];
  const dispatcher=new ScopedConnectionDiagnosticDispatcher({readSecurityFacts:async()=>({environment:fixture.config.environment,securityEpoch:fixture.config.securityEpoch,recoveryLocked:false}),createDispatcher:(diagnosticScope,authorize)=>buildMessagingWorkModule({execute:withActor,authorize,readSecurityConfig:async()=>fixture.config,diagnosticScope,createSender:(preparation)=>new ZavuMessageDeliverySender(preparation,transport.fetch),runtime:{now:Date.now,createId:randomUUID,defer:(work)=>{deferred.push(work);},report:(diagnostic)=>{diagnostics.push(diagnostic);}}}).useCases.dispatch});
  return{...fixture,sessionId,accountId,subject,originalIssue:fixture.issue,request,operation:messagingModule.createConnectionOperationReadModule().useCases,usage:messagingModule.createUsageModule({readSecurityConfig:async()=>fixture.config}).useCases,delivery:messagingModule.createDeliveryReadModule().useCases,issue:request.createDiagnosticIssuance(dispatcher),transport,deferred,diagnostics,get sentCode(){return sentCode;},input:{tribeId:fixture.scope.tribeId,connectionId:fixture.scope.connectionId,requestId:randomUUID(),operationId:randomUUID(),expectedVersion:1,confirmed:true as const,channel:fixture.scope.channel,recipient:fixture.scope.contact.value,...(phone?{country:"AR"}:{})}};
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("native diagnostic issue workflow",()=>{
  it("should explicitly replace an SMS challenge with WhatsApp for the same phone while preserving both verified channels and consumed attempts",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await workflowFixture(database,true,true);
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at) values (${fixture.scope.tribeId},${fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','unprepared',clock_timestamp())`));
      expect(await fixture.usage.update({tribeId:fixture.scope.tribeId,requestId:randomUUID(),operationId:randomUUID(),confirmed:true,expectedVersion:1,allowedCountries:["AR"],verificationDailyLimit:100,notificationDailyLimit:200})).toMatchObject({ok:true,value:{state:"completed"}});
      const issued=await fixture.issue.execute(fixture.input);
      if(!issued.ok||issued.value.state!=="completed"||issued.value.result.outcome!=="issued")throw new Error("Expected initial SMS diagnostic");
      const original=issued.value.result;await Promise.all(fixture.deferred);
      expect(await fixture.request.useCases.verifyDiagnostic.execute({tribeId:fixture.scope.tribeId,connectionId:fixture.scope.connectionId,diagnosticId:original.diagnosticId,operationId:randomUUID(),code:fixture.sentCode,requestId:randomUUID()})).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"verified",channel:"sms"}}});
      await advanceVerificationRequestCooldown(database,fixture);
      const switched=await fixture.issue.execute({...fixture.input,channel:"whatsapp",currentChallengeId:original.challengeId,operationId:randomUUID()});
      expect(switched).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"issued",channel:"whatsapp",connectionVersion:1}}});
      if(!switched.ok||switched.value.state!=="completed"||switched.value.result.outcome!=="issued")throw new Error("Expected explicit WhatsApp replacement");
      await Promise.all(fixture.deferred);expect(fixture.transport.receipts).toHaveLength(2);expect(fixture.diagnostics).toEqual([]);
      expect(await fixture.request.useCases.verifyDiagnostic.execute({tribeId:fixture.scope.tribeId,connectionId:fixture.scope.connectionId,diagnosticId:switched.value.result.diagnosticId,operationId:randomUUID(),code:fixture.sentCode,requestId:randomUUID()})).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"verified",channel:"whatsapp"}}});
      const history=await database.withContext(fixture.own,async(transaction)=>({
        diagnostics:(await transaction.execute(sql`select channel,outcome,validated_at from public.messaging_connection_diagnostics where connection_id=${fixture.scope.connectionId} order by channel`)).rows,
        capabilities:(await transaction.execute(sql`select channel,state,tested_at from public.messaging_connection_capabilities where connection_id=${fixture.scope.connectionId} and connection_version=1 order by channel`)).rows,
        original:(await transaction.execute(sql`select is_current,state from public.contact_verification_challenges where id=${original.challengeId}`)).rows[0],
        counts:(await transaction.execute(sql`select (select count(*)::int from public.message_delivery_attempts where tribe_id=${fixture.scope.tribeId}) as attempts,(select count(*)::int from public.messaging_usage_reservations where tribe_id=${fixture.scope.tribeId}) as reservations,(select count(*)::int from public.academy_admission_verification_proofs where tribe_id=${fixture.scope.tribeId}) as proofs`)).rows[0],
      }));
      expect(history.diagnostics).toEqual([{channel:"sms",outcome:"verified",validated_at:expect.anything()},{channel:"whatsapp",outcome:"verified",validated_at:expect.anything()}]);expect(history.capabilities).toEqual([{channel:"sms",state:"prepared",tested_at:expect.anything()},{channel:"whatsapp",state:"prepared",tested_at:expect.anything()}]);expect(history.original).toEqual({is_current:false,state:"verified"});expect(history.counts).toEqual({attempts:2,reservations:2,proofs:0});
    });
  },480_000);
  it.each([{selected:false},{selected:true}])("should retire an edited diagnostic namespace while preserving historical proof and accepted consumption, selected=$selected",async({selected})=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await workflowFixture(database),issued=await fixture.issue.execute(fixture.input);
      if(!issued.ok||issued.value.state!=="completed"||issued.value.result.outcome!=="issued")throw new Error("Expected original diagnostic");
      const original=issued.value.result;await Promise.all(fixture.deferred);
      expect(await fixture.request.useCases.verifyDiagnostic.execute({tribeId:fixture.scope.tribeId,connectionId:fixture.scope.connectionId,diagnosticId:original.diagnosticId,operationId:randomUUID(),code:fixture.sentCode,requestId:randomUUID()})).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"verified",connectionVersion:1}}});
      if(selected)await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=1,is_candidate=false,candidate_version=null,state='active' where id=${fixture.scope.connectionId}`));
      const context=await database.withContext(fixture.own,async(transaction):Promise<AuthorizedMessagingContext>=>{
        const row=(await transaction.execute<{secret_ref:string;authenticated_at:Date;valid_until:Date}>(sql`select resource.secret_ref,evidence.authenticated_at,evidence.valid_until from public.messaging_connection_versions resource join public.recent_authentication_evidence evidence on evidence.resource_id=resource.connection_id::text and evidence.operation='configure_messaging_connection' and evidence.session_id=${fixture.sessionId} where resource.connection_id=${fixture.scope.connectionId} and resource.version=1`)).rows[0];
        return{authorizationPurpose:"sensitive_leader",actorUserId:fixture.userId,sessionId:fixture.sessionId,accountId:fixture.accountId,subject:fixture.subject,operation:"configure_messaging_connection",resourceId:fixture.scope.connectionId,tribeId:fixture.scope.tribeId,connectionId:fixture.scope.connectionId,connectionVersion:1,environment:fixture.config.environment,securityEpoch:fixture.config.securityEpoch,requestId:randomUUID(),secretRef:row.secret_ref,authenticatedAt:new Date(row.authenticated_at),validUntil:new Date(row.valid_until)};
      });
      const writer=new PostgresMessagingConnectionConfiguration((_context,run)=>database.withContext(fixture.own,run),async()=>fixture.config),senderId=randomUUID();
      expect(await writer.commit(context,{operationId:randomUUID(),expectedVersion:1,confirmed:true,channel:"email",senderId},{credential:fixture.credential,sender:{resourceId:senderId,name:"Nuevo remitente",channels:["email"],canSendWhatsappTemplates:false}})).toMatchObject({state:"completed",result:{configurationVersion:2,version:2}});
      expect(fixture.transport.receipts).toHaveLength(1);
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.messaging_connection_versions set credential_validation_status='valid',is_test_mode=false,credential_validated_at=clock_timestamp() where connection_id=${fixture.scope.connectionId} and version=2`));
      await advanceVerificationRequestCooldown(database,fixture);
      const next=await fixture.issue.execute({...fixture.input,expectedVersion:2,operationId:randomUUID()});
      expect(next).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"issued",connectionVersion:2}}});
      await Promise.all(fixture.deferred);expect(fixture.transport.receipts).toHaveLength(2);
      const history=await database.withContext(fixture.own,async(transaction)=>({
        challenge:(await transaction.execute(sql`select is_current,state,code_mac,code_envelope_id from public.contact_verification_challenges where id=${original.challengeId}`)).rows[0],
        diagnostic:(await transaction.execute(sql`select outcome,validated_at from public.messaging_connection_diagnostics where id=${original.diagnosticId}`)).rows[0],
        delivery:(await transaction.execute(sql`select state from public.message_deliveries where id=${original.deliveryId}`)).rows[0],
        selectedVersion:(await transaction.execute(sql`select selected_version,candidate_version from public.tenant_messaging_connections where id=${fixture.scope.connectionId}`)).rows[0],
        resource:(await transaction.execute(sql`select retired_at from public.messaging_connection_versions where connection_id=${fixture.scope.connectionId} and version=1`)).rows[0],
        capability:(await transaction.execute(sql`select state,tested_at from public.messaging_connection_capabilities where connection_id=${fixture.scope.connectionId} and connection_version=1 and channel='email'`)).rows[0],
        counts:(await transaction.execute(sql`select (select count(*)::int from public.message_delivery_attempts where delivery_id=${original.deliveryId}) as attempts,(select count(*)::int from public.messaging_usage_reservations where delivery_id=${original.deliveryId}) as reservations,(select count(*)::int from public.academy_admission_verification_proofs where tribe_id=${fixture.scope.tribeId}) as admission_proofs`)).rows[0],
      }));
      expect(history.challenge).toEqual({is_current:false,state:"verified",code_mac:null,code_envelope_id:null});expect(history.diagnostic).toMatchObject({outcome:"verified",validated_at:expect.anything()});expect(history.delivery).toEqual({state:"accepted"});expect(history.counts).toEqual({attempts:1,reservations:1,admission_proofs:0});
      expect(history.selectedVersion).toEqual({selected_version:selected?1:null,candidate_version:2});expect(history.resource).toEqual({retired_at:selected?null:expect.anything()});expect(history.capability).toMatchObject({state:"prepared",tested_at:expect.anything()});
      if(!next.ok||next.value.state!=="completed"||next.value.result.outcome!=="issued")throw new Error("Expected next diagnostic");
      const currentDiagnostic=next.value.result,secretRef=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute<{secret_ref:string}>(sql`select secret_ref from public.messaging_connection_versions where connection_id=${fixture.scope.connectionId} and version=2`)).rows[0].secret_ref),thirdSender=randomUUID();
      expect(await writer.commit({...context,connectionVersion:2,secretRef},{operationId:randomUUID(),expectedVersion:2,confirmed:true,channel:"email",senderId:thirdSender},{credential:fixture.credential,sender:{resourceId:thirdSender,name:"Otro remitente",channels:["email"],canSendWhatsappTemplates:false}})).toMatchObject({state:"completed",result:{configurationVersion:3}});
      const pendingHistory=await database.withContext(fixture.own,async(transaction)=>({
        challenge:(await transaction.execute(sql`select is_current,state,code_mac,code_envelope_id from public.contact_verification_challenges where id=${currentDiagnostic.challengeId}`)).rows[0],
        diagnostic:(await transaction.execute(sql`select outcome,validated_at from public.messaging_connection_diagnostics where id=${currentDiagnostic.diagnosticId}`)).rows[0],
        delivery:(await transaction.execute(sql`select state from public.message_deliveries where id=${currentDiagnostic.deliveryId}`)).rows[0],
        reservations:(await transaction.execute<{count:number}>(sql`select count(*)::int as count from public.messaging_usage_reservations where delivery_id=${currentDiagnostic.deliveryId}`)).rows[0].count,
      }));
      expect(pendingHistory).toEqual({challenge:{is_current:false,state:"invalidated",code_mac:null,code_envelope_id:null},diagnostic:{outcome:"invalidated",validated_at:null},delivery:{state:"accepted"},reservations:1});expect(fixture.transport.receipts).toHaveLength(2);
    });
  },480_000);
  it("should dispatch once outside SQL and verify only the exact diagnostic capability, with no admission/global proof",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await workflowFixture(database),issued=await fixture.issue.execute(fixture.input);expect(issued).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"issued",connectionVersion:1}}});
      if(!issued.ok||issued.value.state!=="completed"||issued.value.result.outcome!=="issued")throw new Error("Expected issued diagnostic");const result=issued.value.result;
      expect(await fixture.operation.execute({tribeId:fixture.scope.tribeId,operationId:fixture.input.operationId,requestId:randomUUID()})).toMatchObject({ok:true,value:{type:"diagnose_messaging_connection",state:"completed",result}});
      const admissionCommand={actorUserId:fixture.userId,tribeId:fixture.scope.tribeId,operationType:VERIFICATION_ISSUANCE_OPERATION.resend,idempotencyKey:fixture.input.operationId,intent:{purpose:"admission"}};
      await fixture.ledger.run(admissionCommand,connectionDiagnosticIssuanceSchema,async()=>({outcome:"denied",code:"recipient_not_allowed"}));
      expect(await fixture.operation.execute({tribeId:fixture.scope.tribeId,operationId:fixture.input.operationId,requestId:randomUUID()})).toMatchObject({ok:true,value:{type:"diagnose_messaging_connection",result}});
      const pendingId=randomUUID(),pendingEntered=Promise.withResolvers<void>(),releasePending=Promise.withResolvers<void>();let released=false;
      const pending=fixture.ledger.run({...admissionCommand,operationType:VERIFICATION_ISSUANCE_OPERATION.issue,idempotencyKey:pendingId,intent:{purpose:"connection_diagnostic"}},connectionDiagnosticIssuanceSchema,async(transaction)=>{
        pendingEntered.resolve();releasePending.promise.then(()=>{released=true;});while(!released)await transaction.execute(sql`select pg_sleep(0.25)`);return{outcome:"denied",code:"recipient_not_allowed"};
      });
      await pendingEntered.promise;
      try{expect(await fixture.operation.execute({tribeId:fixture.scope.tribeId,operationId:pendingId,requestId:randomUUID()})).toMatchObject({ok:true,value:{type:"diagnose_messaging_connection",state:"started"}});}finally{releasePending.resolve();}
      await pending;expect(await fixture.operation.execute({tribeId:fixture.scope.tribeId,operationId:pendingId,requestId:randomUUID()})).toMatchObject({ok:true,value:{type:"diagnose_messaging_connection",state:"completed",result:{outcome:"denied",code:"recipient_not_allowed"}}});
      const legacyId=randomUUID();await fixture.ledger.run({...admissionCommand,operationType:VERIFICATION_ISSUANCE_OPERATION.issue,idempotencyKey:legacyId,intent:{}},connectionDiagnosticIssuanceSchema,async()=>({outcome:"denied",code:"recipient_not_allowed"}));
      expect(await fixture.operation.execute({tribeId:fixture.scope.tribeId,operationId:legacyId,requestId:randomUUID()})).toMatchObject({ok:false,failure:{code:"resource_unavailable"}});
      await expect(database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.academy_admission_operations set verification_purpose='admission' where tribe_id=${fixture.scope.tribeId} and idempotency_key=${pendingId}`))).rejects.toMatchObject({cause:{code:"23514"}});
      await Promise.all(fixture.deferred);expect(fixture.transport.receipts).toHaveLength(1);expect(fixture.diagnostics).toEqual([]);expect(JSON.stringify(issued)).not.toContain(fixture.credential);expect(JSON.stringify(issued)).not.toContain(fixture.sentCode);
      expect(await fixture.delivery.execute({tribeId:fixture.scope.tribeId,deliveryId:result.deliveryId,requestId:randomUUID()})).toMatchObject({ok:true,value:{id:result.deliveryId,state:"accepted",purpose:"connection_diagnostic",channel:"email"}});expect(fixture.transport.receipts).toHaveLength(1);
      expect(await fixture.issue.execute(fixture.input)).toMatchObject({ok:true,value:{replayed:true,result}});expect(fixture.transport.receipts).toHaveLength(1);
      const verified=await fixture.request.useCases.verifyDiagnostic.execute({tribeId:fixture.scope.tribeId,connectionId:fixture.scope.connectionId,diagnosticId:result.diagnosticId,operationId:randomUUID(),code:fixture.sentCode,requestId:randomUUID()});expect(verified).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"verified",connectionVersion:1,channel:"email",capabilityState:"prepared"}}});
      const counts=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.message_delivery_attempts where delivery_id=${result.deliveryId}) as attempts,(select count(*)::int from public.messaging_usage_reservations where delivery_id=${result.deliveryId}) as reservations,(select count(*)::int from public.academy_admission_verification_proofs where challenge_id=${result.challengeId}) as proofs,(select count(*)::int from public.global_identity_evidence where user_id=${fixture.userId}) as global_evidence`)).rows[0]);expect(counts).toEqual({attempts:1,reservations:1,proofs:0,global_evidence:0});
      await advanceVerificationRequestCooldown(database,fixture);const resendId=randomUUID(),resent=await fixture.issue.execute({...fixture.input,currentChallengeId:result.challengeId,operationId:resendId});expect(resent).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"issued"}}});
      if(!resent.ok||resent.value.state!=="completed")throw new Error("Expected original resend commit");
      await Promise.all(fixture.deferred);expect(await fixture.operation.execute({tribeId:fixture.scope.tribeId,operationId:resendId,requestId:randomUUID()})).toMatchObject({ok:true,value:{type:"diagnose_messaging_connection",state:"completed",result:resent.value.result}});expect(fixture.transport.receipts).toHaveLength(2);
    });
  },360_000);
  it("should block a phone diagnostic while countries are empty before generating code, consuming request budget or calling SDK",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await workflowFixture(database,true),issued=await fixture.issue.execute(fixture.input);expect(issued).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"denied",code:"recipient_not_allowed"}}});expect(fixture.transport.receipts).toHaveLength(0);
      const counts=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.contact_verification_challenges where tribe_id=${fixture.scope.tribeId}) as challenges,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.scope.tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId}) as events`)).rows[0]);expect(counts).toEqual({challenges:0,deliveries:0,events:0});
      const configured=await fixture.usage.update({tribeId:fixture.scope.tribeId,requestId:randomUUID(),operationId:randomUUID(),confirmed:true,expectedVersion:1,allowedCountries:["AR"],verificationDailyLimit:100,notificationDailyLimit:200});expect(configured).toMatchObject({ok:true,value:{state:"completed",result:{version:2,allowedCountries:["AR"]}}});expect(fixture.transport.receipts).toHaveLength(0);
      const permitted=await fixture.issue.execute({...fixture.input,operationId:randomUUID()});expect(permitted).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"issued",channel:"sms"}}});await Promise.all(fixture.deferred);expect(fixture.transport.receipts).toHaveLength(1);expect(fixture.diagnostics).toEqual([]);
    });
  },240_000);
  it("should read original transport concurrently with a real resend without a delivery/challenge lock inversion",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await workflowFixture(database),issued=await fixture.issue.execute(fixture.input);if(!issued.ok||issued.value.state!=="completed"||issued.value.result.outcome!=="issued")throw new Error("Expected original diagnostic");
      const original=issued.value.result;await Promise.all(fixture.deferred);await advanceVerificationRequestCooldown(database,fixture);
      const deliveryHeld=Promise.withResolvers<number>(),readerStarted=Promise.withResolvers<number>(),releaseResend=Promise.withResolvers<void>();
      const resending=fixture.originalIssue(original.challengeId,randomUUID(),async()=>fixture.config,async(transaction)=>{
        const pid=(await transaction.execute<{pid:number}>(sql`select pg_backend_pid() as pid`)).rows[0].pid;
        await transaction.execute(sql`select id from public.message_deliveries where id=${original.deliveryId} for update`);deliveryHeld.resolve(pid);await releaseResend.promise;
      });
      const holderPid=await deliveryHeld.promise;
      const reader=new PostgresMessageDeliveryReader((_context,run)=>database.withContext(fixture.own,async(transaction)=>{readerStarted.resolve((await transaction.execute<{pid:number}>(sql`select pg_backend_pid() as pid`)).rows[0].pid);return run(transaction);}));
      const reading=reader.read({actorUserId:fixture.userId,sessionId:fixture.sessionId,tribeId:fixture.scope.tribeId,requestId:randomUUID()},original.deliveryId),readerPid=await readerStarted.promise;
      let observedWait=false;
      try{for(let attempt=0;attempt<100;attempt+=1){const blockers=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute<{blockers:number[]}>(sql`select pg_blocking_pids(${readerPid}) as blockers`)).rows[0].blockers);if(blockers.includes(holderPid)){observedWait=true;break;}await delay(50);}}finally{releaseResend.resolve();}
      const outcomes=await Promise.allSettled([resending,reading]);expect(observedWait).toBe(true);for(const outcome of outcomes){if(outcome.status==="rejected")throw outcome.reason;}
      expect(outcomes[1]).toMatchObject({status:"fulfilled",value:{id:original.deliveryId,state:"accepted"}});expect(fixture.transport.receipts).toHaveLength(1);
    });
  },360_000);
});
