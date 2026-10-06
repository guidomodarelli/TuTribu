/** @vitest-environment node */

/** Exercises the public reconciliation entrypoints with real PostgreSQL and an owned provider port. */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase,type AcademyAdmissionTestDatabase} from "@/tests/support/academy-admission-database";
import {PostgresTribeSubscriptionPriceRepository} from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-subscription-price-repository";
import {PostgresTribeMemberSubscriptionRepository} from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import {TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE} from "@/src/modules/subscriptions/constants/subscriptions";

/** Seeds synthetic provider references; credentials are random, private and never used for HTTP. */
async function seedReconciliation(database:AcademyAdmissionTestDatabase,product:"membership"|"academy",state:"active"|"muted"|"blocked"|"removed",reason="none") {
  for(const migration of ["20261005090000_create_admission_identity_evidence.sql","20261005091000_create_academy_admission_core.sql","20261005091500_guard_admission_evidence_transitions.sql","20261005092000_create_tenant_messaging.sql","20261005092500_guard_messaging_attempts.sql","20261005093000_guard_academy_membership_sources.sql"]) await database.applyMigration(migration);
  const leaderId=randomUUID();const userId=randomUUID();const tribeId=randomUUID();const priceId=randomUUID();const integrationId=randomUUID();const subscriptionId=randomUUID();const providerId=randomUUID();const slug=`reconciliation-${tribeId}`;
  const own={userId:leaderId,email:null};
  await database.withContext(own,async(transaction)=>{
    for(const id of [leaderId,userId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${id},'Synthetic reconciliation account',${`${id}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic reconciliation tribe',${slug},${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,status_reason) values (${tribeId},${leaderId},'leader','active','none'),(${tribeId},${userId},'tribemate',${state},${reason})`);
    await transaction.execute(sql`insert into public.tribe_payment_integrations(id,tribe_id,provider,account_label,status,access_token,token_expires_at,connected_by) values (${integrationId},${tribeId},'mercado_pago','Synthetic account','connected',${randomUUID()},clock_timestamp()+interval '1 day',${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_subscription_prices(id,tribe_id,name,amount_cents,currency,frequency,status,is_current,mercado_pago_preapproval_plan_id,payment_integration_id,product_key,created_by) values (${priceId},${tribeId},'Synthetic price',1500,'ARS','monthly','active',true,${randomUUID()},${integrationId},${product},${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_member_subscriptions(id,tribe_id,user_id,price_id,payment_integration_id,mercado_pago_preapproval_id,status,product_key,price_snapshot_amount_cents,price_snapshot_currency,price_snapshot_frequency,terms_accepted_at,updated_at) values (${subscriptionId},${tribeId},${userId},${priceId},${integrationId},${providerId},'active',${product},1500,'ARS','monthly',clock_timestamp(),clock_timestamp()-interval '1 hour')`);
  });
  return {own,userId,tribeId,priceId,providerId,subscriptionId,slug};
}

/** Constructs the actual repository while keeping provider reads on its owned adapter boundary. */
function createRepository(database:AcademyAdmissionTestDatabase,own:{userId:string;email:null},providerStatus:"authorized"|"cancelled") {
  const unexpected=async()=>{throw new Error("Reconciliation test unexpectedly invoked a provider mutation");};
  return new PostgresTribeSubscriptionPriceRepository(
    (callback)=>database.withContext(own,callback),unexpected,unexpected,unexpected,unexpected,unexpected,
    async()=>providerStatus,randomUUID(),
  );
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("academy membership reconciliation",()=>{
  it("should reread webhook replay state after a concurrent subscription change during its provider read",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,"membership","muted");
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`insert into public.subscription_idempotency_operations(operation_key,operation_type,payload_hash,response_body) values (${`mercado-pago-webhook:${fixture.providerId}:active:none`},'mercado_pago_webhook',${randomUUID()},'{}')`));
      const unexpected=async()=>{throw new Error("Reconciliation test unexpectedly invoked a provider mutation");};
      const providerRead=async()=>{
        await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.tribe_member_subscriptions set status='paused',updated_at=clock_timestamp() where id=${fixture.subscriptionId}`));
        return "authorized";
      };
      const repository=new PostgresTribeMemberSubscriptionRepository((callback)=>database.withContext(fixture.own,callback),unexpected,unexpected,providerRead,unexpected,unexpected,unexpected,randomUUID());
      expect(await repository.handleWebhook({eventId:randomUUID(),resourceId:fixture.providerId,topic:"subscription_preapproval"})).toMatchObject({status:"processed"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select status from public.tribe_member_subscriptions where id=${fixture.subscriptionId}`)).rows)).toEqual([{status:"active"}]);
    });
  },120_000);

  it("should serialize current and historical price reconciliations without reviving canceled membership",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,"membership","muted");
      const previousPriceId=randomUUID();const previousProviderId=randomUUID();
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public.tribe_subscription_prices(id,tribe_id,name,amount_cents,currency,frequency,status,is_current,mercado_pago_preapproval_plan_id,payment_integration_id,product_key,created_by) select ${previousPriceId},tribe_id,'Synthetic historical price',1500,'ARS','monthly','canceled',false,${randomUUID()},payment_integration_id,'membership',${fixture.own.userId} from public.tribe_subscription_prices where id=${fixture.priceId}`);
        await transaction.execute(sql`insert into public.tribe_member_subscriptions(tribe_id,user_id,price_id,payment_integration_id,mercado_pago_preapproval_id,status,product_key,updated_at) select ${fixture.tribeId},${fixture.userId},${previousPriceId},payment_integration_id,${previousProviderId},'canceled','membership',clock_timestamp()-interval '1 hour' from public.tribe_subscription_prices where id=${previousPriceId}`);
      });
      const repository=createRepository(database,fixture.own,"cancelled");
      await Promise.all([fixture.priceId,previousPriceId].map((priceId)=>repository.reconcileProviderSubscribers({priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton})));
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select status,status_reason,commercial_recovery_status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows)).toEqual([{status:"removed",status_reason:"subscription_inactive",commercial_recovery_status:"muted"}]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select status from public.tribe_member_subscriptions where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows)).toEqual([{status:"canceled"},{status:"canceled"}]);
    });
  },120_000);

  it.each(["price","diagnostics"] as const)("should retain a consumed basic admission basis when an old membership subscription expires through %s",async(entrypoint)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,"membership","muted");
      const requestId=randomUUID();const decisionId=randomUUID();const effectId=randomUUID();
      await database.withContext(fixture.own,async(transaction)=>{
        const instant=(await transaction.execute(sql`select clock_timestamp() as instant`)).rows[0].instant;
        await transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='payment_blocked' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${fixture.tribeId},true,${instant})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${fixture.tribeId}`);
        const memberId=(await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows[0].id;
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${fixture.tribeId},${fixture.userId},'common',clock_timestamp()+interval '29 days')`);
        await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,membership_effect_id) values (${decisionId},${requestId},${fixture.tribeId},${fixture.userId},1,'approved',${fixture.own.userId},'user','synthetic_manual_review',1,1,${effectId})`);
        await transaction.execute(sql`insert into public.academy_admission_membership_effects(id,decision_id,request_id,tribe_id,user_id,member_id,target_status) values (${effectId},${decisionId},${requestId},${fixture.tribeId},${fixture.userId},${memberId},'muted')`);
        await transaction.execute(sql`update public.academy_admission_requests set status='approved',decision_id=${decisionId},version=version+1 where id=${requestId}`);
        await transaction.execute(sql`insert into public.academy_admission_notification_obligations(tribe_id,request_id,applicant_user_id,event_type) values (${fixture.tribeId},${requestId},${fixture.userId},'approved')`);
        await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type) values (${fixture.tribeId},${fixture.own.userId},'admission_request',${requestId},'approved')`);
        await transaction.execute(sql`update public.tribe_members set status='muted',status_reason='none',admission_membership_effect_id=${effectId} where id=${memberId}`);
      });
      const repository=createRepository(database,fixture.own,"cancelled");
      if(entrypoint==="price") await repository.reconcileProviderSubscribers({priceId:fixture.priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton});
      else await repository.reconcileSubscriberDiagnostics({tribeSlug:fixture.slug});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select member.status,basis.revoked_at from public.tribe_members member join public.academy_admission_membership_effects basis on basis.id=member.admission_membership_effect_id where member.tribe_id=${fixture.tribeId} and member.user_id=${fixture.userId}`)).rows)).toEqual([{status:"muted",revoked_at:null}]);
    });
  },120_000);

  it("should preserve muted through the public member subscription reconciliation",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,"membership","muted");
      const unexpected=async()=>{throw new Error("Reconciliation test unexpectedly invoked a provider mutation");};
      const repository=new PostgresTribeMemberSubscriptionRepository((callback)=>database.withContext({userId:fixture.userId,email:null},callback),unexpected,unexpected,async()=>"authorized",unexpected,unexpected,unexpected,randomUUID());
      expect(await repository.reconcileCurrentMemberSubscription({tribeSlug:fixture.slug})).toMatchObject({status:"active"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select role,status,status_reason from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows)).toEqual([{role:"tribemate",status:"muted",status_reason:"none"}]);
    });
  },120_000);

  it.each(["price","diagnostics"] as const)("should preserve conduct and administrative removals through %s",async(entrypoint)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,"membership","blocked","conduct_blocked");
      const repository=createRepository(database,fixture.own,"authorized");
      if(entrypoint==="price") await repository.reconcileProviderSubscribers({priceId:fixture.priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton});
      else await repository.reconcileSubscriberDiagnostics({tribeSlug:fixture.slug});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select status,status_reason from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows)).toEqual([{status:"blocked",status_reason:"conduct_blocked"}]);
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.tribe_members set status='removed',status_reason='none' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      if(entrypoint==="price") await repository.reconcileProviderSubscribers({priceId:fixture.priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton});
      else await repository.reconcileSubscriberDiagnostics({tribeSlug:fixture.slug});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select status,status_reason from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows)).toEqual([{status:"removed",status_reason:"none"}]);
    });
  },120_000);

  it.each(["price","diagnostics"] as const)("should preserve muted membership when %s reconciles an academy subscription",async(entrypoint)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,"academy","muted");
      const repository=createRepository(database,fixture.own,"authorized");
      if(entrypoint==="price") await repository.reconcileProviderSubscribers({priceId:fixture.priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton});
      else await repository.reconcileSubscriberDiagnostics({tribeSlug:fixture.slug});
      const member=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select role,status,status_reason from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows);
      expect(member).toEqual([{role:"tribemate",status:"muted",status_reason:"none"}]);
    });
  },120_000);

  it.each(["price","diagnostics"] as const)("should use the newly reconciled membership state and capture muted before removal through %s",async(entrypoint)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,"membership","muted");
      const repository=createRepository(database,fixture.own,"cancelled");
      if(entrypoint==="price") await repository.reconcileProviderSubscribers({priceId:fixture.priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton});
      else await repository.reconcileSubscriberDiagnostics({tribeSlug:fixture.slug});
      const states=await database.withContext(fixture.own,async(transaction)=>{
        const member=(await transaction.execute(sql`select role,status,status_reason,commercial_recovery_status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows;
        const subscription=(await transaction.execute(sql`select status from public.tribe_member_subscriptions where id=${fixture.subscriptionId}`)).rows;
        return {member,subscription};
      });
      expect(states).toEqual({member:[{role:"tribemate",status:"removed",status_reason:"subscription_inactive",commercial_recovery_status:"muted"}],subscription:[{status:"canceled"}]});
    });
  },120_000);
});
