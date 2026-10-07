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
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {MessagingDispatchDiagnostic} from "@/src/modules/messaging/domain/repositories/message-delivery-sender";

/** @param database - Owned disposable branch. @param phone - Whether to exercise required country configuration. @returns Actual native account/recency and implemented request/work roots without any provider network. */
async function workflowFixture(database:AcademyAdmissionTestDatabase,phone=false){
  const fixture=await prepareContactVerificationIssuer(database,"connection_diagnostic",phone);
  for(const migration of["20261005092500_guard_messaging_attempts.sql","20261005095000_guard_global_identity_context.sql","20261005100000_guard_messaging_secret_retirement.sql","20261006140000_claim_messaging_deliveries_fairly.sql","20261006160000_purge_verification_delivery_material.sql","20261007050000_claim_scoped_diagnostic_delivery.sql"])await database.applyMigration(migration);
  const sessionId=randomUUID(),accountId=randomUUID(),subject=randomUUID();
  await database.withContext(fixture.own,async(transaction)=>{
    const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),validUntil=new Date(now.getTime()+540_000);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},${new Date(now.getTime()+3_600_000)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
    for(const operation of["diagnose_messaging_connection","verify_messaging_diagnostic","update_messaging_usage"]){const intentId=randomUUID(),resourceId=operation==="update_messaging_usage"?fixture.scope.tribeId:fixture.scope.connectionId;await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${fixture.scope.tribeId},${operation},${resourceId},'/synthetic-diagnostic-workflow',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${fixture.scope.tribeId},${operation},${resourceId},${now},${now},${validUntil})`);}
  });
  let transactions=0,sentCode="";
  const withActor=async<Result>(userId:string|null,run:(database:RequestDatabase)=>Promise<Result>)=>{transactions+=1;try{return await database.withContext({userId,email:userId===fixture.userId?fixture.own.email:null},run);}finally{transactions-=1;}};
  const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.userId,sessionId}),(_identity,run)=>withActor(fixture.userId,run));
  const messagingModule=buildMessagingModule({accounts,clock:()=>new Date(),execute:(account,run)=>withActor(account.userId,run)}),request=messagingModule.createRequestModule({selection:"management",readSecurityConfig:async()=>fixture.config});
  const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/messages",method:"POST",respond:async(incoming)=>{
    expect(transactions).toBe(0);expect(incoming.headers.get("Authorization")).toBe(`Bearer ${fixture.credential}`);
    const body=await incoming.json() as{channel:string;text:string;fallbackEnabled:boolean;idempotencyKey:string};expect(body.fallbackEnabled).toBe(false);expect(body.channel).toBe(fixture.scope.channel);sentCode=body.text.slice(VERIFICATION_MESSAGE_COPY.prefix.length,-VERIFICATION_MESSAGE_COPY.suffix.length);expect(sentCode).toMatch(/^\d{6}$/u);
    return Response.json({message:{id:randomUUID(),direction:"outbound",channel:body.channel,status:"sent"}});
  }}]);
  const deferred:Promise<void>[]=[],diagnostics:MessagingDispatchDiagnostic[]=[];
  const dispatcher=new ScopedConnectionDiagnosticDispatcher({readSecurityFacts:async()=>({environment:fixture.config.environment,securityEpoch:fixture.config.securityEpoch,recoveryLocked:false}),createDispatcher:(diagnosticScope,authorize)=>buildMessagingWorkModule({execute:withActor,authorize,readSecurityConfig:async()=>fixture.config,diagnosticScope,createSender:(preparation)=>new ZavuMessageDeliverySender(preparation,transport.fetch),runtime:{now:Date.now,createId:randomUUID,defer:(work)=>{deferred.push(work);},report:(diagnostic)=>{diagnostics.push(diagnostic);}}}).useCases.dispatch});
  return{...fixture,sessionId,originalIssue:fixture.issue,request,usage:messagingModule.createUsageModule({readSecurityConfig:async()=>fixture.config}).useCases,delivery:messagingModule.createDeliveryReadModule().useCases,issue:request.createDiagnosticIssuance(dispatcher),transport,deferred,diagnostics,get sentCode(){return sentCode;},input:{tribeId:fixture.scope.tribeId,connectionId:fixture.scope.connectionId,requestId:randomUUID(),operationId:randomUUID(),expectedVersion:1,confirmed:true as const,channel:fixture.scope.channel,recipient:fixture.scope.contact.value,...(phone?{country:"AR"}:{})}};
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("native diagnostic issue workflow",()=>{
  it("should dispatch once outside SQL and verify only the exact diagnostic capability, with no admission/global proof",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await workflowFixture(database),issued=await fixture.issue.execute(fixture.input);expect(issued).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"issued",connectionVersion:1}}});
      if(!issued.ok||issued.value.state!=="completed"||issued.value.result.outcome!=="issued")throw new Error("Expected issued diagnostic");const result=issued.value.result;
      await Promise.all(fixture.deferred);expect(fixture.transport.receipts).toHaveLength(1);expect(fixture.diagnostics).toEqual([]);expect(JSON.stringify(issued)).not.toContain(fixture.credential);expect(JSON.stringify(issued)).not.toContain(fixture.sentCode);
      expect(await fixture.delivery.execute({tribeId:fixture.scope.tribeId,deliveryId:result.deliveryId,requestId:randomUUID()})).toMatchObject({ok:true,value:{id:result.deliveryId,state:"accepted",purpose:"connection_diagnostic",channel:"email"}});expect(fixture.transport.receipts).toHaveLength(1);
      expect(await fixture.issue.execute(fixture.input)).toMatchObject({ok:true,value:{replayed:true,result}});expect(fixture.transport.receipts).toHaveLength(1);
      const verified=await fixture.request.useCases.verifyDiagnostic.execute({tribeId:fixture.scope.tribeId,connectionId:fixture.scope.connectionId,diagnosticId:result.diagnosticId,operationId:randomUUID(),code:fixture.sentCode,requestId:randomUUID()});expect(verified).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"verified",connectionVersion:1,channel:"email",capabilityState:"prepared"}}});
      const counts=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.message_delivery_attempts where delivery_id=${result.deliveryId}) as attempts,(select count(*)::int from public.messaging_usage_reservations where delivery_id=${result.deliveryId}) as reservations,(select count(*)::int from public.academy_admission_verification_proofs where challenge_id=${result.challengeId}) as proofs,(select count(*)::int from public.global_identity_evidence where user_id=${fixture.userId}) as global_evidence`)).rows[0]);expect(counts).toEqual({attempts:1,reservations:1,proofs:0,global_evidence:0});
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
