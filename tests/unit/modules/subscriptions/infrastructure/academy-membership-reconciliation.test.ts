/** @vitest-environment node */

/** Exercises the public reconciliation entrypoints with real PostgreSQL and an owned provider port. */
import { createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";
import type { PaidAdmissionResolutionFactory } from "@/src/modules/subscriptions/infrastructure/repositories/subscription-membership-source-writer";
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase,type AcademyAdmissionTestDatabase} from "@/tests/support/academy-admission-database";
import {PostgresTribeSubscriptionPriceRepository} from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-subscription-price-repository";
import {PostgresTribeMemberSubscriptionRepository} from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import {TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE} from "@/src/modules/subscriptions/constants/subscriptions";

/** Seeds synthetic provider references; credentials are random, private and never used for HTTP. */
async function seedReconciliation(database:AcademyAdmissionTestDatabase,product:"membership"|"academy",state:"active"|"muted"|"blocked"|"removed",reason="none") {
  for(const migration of ["20261005090000_create_admission_identity_evidence.sql","20261005091000_create_academy_admission_core.sql","20261005091500_guard_admission_evidence_transitions.sql","20261005092000_create_tenant_messaging.sql","20261005092500_guard_messaging_attempts.sql","20261005093000_guard_academy_membership_sources.sql","20261006180000_guard_subscription_membership_sources.sql","20261006200000_scope_admission_audit_operations.sql","20261006220000_extend_admission_notifications.sql","20261007020000_resolve_paid_admission_requests.sql","20261007023000_close_unavailable_admission_requests.sql"]) await database.applyMigration(migration);
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
function createRepository(database:AcademyAdmissionTestDatabase,own:{userId:string;email:null},providerStatus:"authorized"|"cancelled",createAdmissionResolution:PaidAdmissionResolutionFactory=createPaidAdmissionResolutionWriter) {
  const unexpected=async()=>{throw new Error("Reconciliation test unexpectedly invoked a provider mutation");};
  return new PostgresTribeSubscriptionPriceRepository(
    (callback)=>database.withContext(own,callback),unexpected,unexpected,unexpected,unexpected,unexpected,
    async()=>providerStatus,createAdmissionResolution,randomUUID(),
  );
}

/** @param database - Owned branch. @param fixture - Current scoped payment actors. @param expired - Seeds a genuinely expired original deadline. @returns Exact pending request id, without weakening any SQL guard. */
async function seedPendingPaidAdmission(database:AcademyAdmissionTestDatabase,fixture:Awaited<ReturnType<typeof seedReconciliation>>,expired=false):Promise<string>{
  const admissionRequestId=randomUUID();
  await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,submitted_at,expires_at) select ${admissionRequestId},${fixture.tribeId},${fixture.userId},'common','email',${`${fixture.userId}@example.test`},'declared','{"version":1,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":false}'::jsonb,case when ${expired} then now-interval '31 days' else now end,case when ${expired} then now-interval '1 day' else now+interval '30 days' end from instant`));
  return admissionRequestId;
}

/** Activates only the synthetic owned tribe's durable marker and policy in one actual commit. */
async function activateProtectedTribe(database:AcademyAdmissionTestDatabase,fixture:Awaited<ReturnType<typeof seedReconciliation>>) {
  await database.withContext(fixture.own,async(transaction)=>{
    const instant=(await transaction.execute<{instant:Date|string}>(sql`select clock_timestamp() as instant`)).rows[0].instant;
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${fixture.tribeId},true,${instant})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${fixture.tribeId}`);
  });
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("academy membership reconciliation",()=>{
  it("should allow only the receipt owner/current payment authority under runtime and NOBYPASSRLS without admission table write grants",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      process.stdout.write(JSON.stringify({phase:"owned_paid_admission_guard_branch",branch:database.branch})+"\n");
      const fixture=await seedReconciliation(database,"membership","muted");
      await activateProtectedTribe(database,fixture);
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await createRepository(database,fixture.own,"authorized").reconcileProviderSubscribers({priceId:fixture.priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton});
      const effectId=(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute<{id:string}>(sql`select subscription_membership_effect_id as id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows[0])).id;
      const scope={membershipEffectId:effectId,tribeId:fixture.tribeId,userId:fixture.userId};
      for(const role of ["runtime","non_bypass"] as const){
        const admissionRequestId=await seedPendingPaidAdmission(database,fixture);
        await expect(database.withContext({userId:randomUUID(),email:null},(transaction)=>createPaidAdmissionResolutionWriter(transaction).resolvePaidMembership(scope),role)).rejects.toMatchObject({cause:{code:"42501"}});
        await expect(database.withContext(fixture.own,(transaction)=>createPaidAdmissionResolutionWriter(transaction).resolvePaidMembership({...scope,tribeId:randomUUID()}),role)).rejects.toMatchObject({cause:{code:"42501"}});
        await database.withContext({userId:fixture.userId,email:null},async(transaction)=>{
          if(role==="non_bypass")expect((await transaction.execute(sql`select has_table_privilege(current_user,'public.academy_admission_requests','INSERT') as can_insert,has_table_privilege(current_user,'public.academy_admission_requests','UPDATE') as can_update`)).rows).toEqual([{can_insert:false,can_update:false}]);
          await createPaidAdmissionResolutionWriter(transaction).resolvePaidMembership(scope);
          await createPaidAdmissionResolutionWriter(transaction).resolvePaidMembership(scope);
        },role);
        expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${admissionRequestId}`)).rows)).toEqual([{status:"cancelled",version:2}]);
      }
      const remaining=await seedPendingPaidAdmission(database,fixture);
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set status='removed',status_reason='none' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await expect(database.withContext(fixture.own,(transaction)=>createPaidAdmissionResolutionWriter(transaction).resolvePaidMembership(scope))).rejects.toMatchObject({cause:{code:"42501"}});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select status,version,cancel_reason from public.academy_admission_requests where id=${remaining}`)).rows)).toEqual([{status:"cancelled",version:2,cancel_reason:"nonrecoverable_membership"}]);
    });
  },240_000);

  it("should roll back paid recovery, system resolution and notices together when the own collaborator fails after staging",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      process.stdout.write(JSON.stringify({phase:"owned_paid_admission_rollback_branch",branch:database.branch})+"\n");
      const fixture=await seedReconciliation(database,"membership","muted");
      await activateProtectedTribe(database,fixture);
      await database.withContext(fixture.own,async(transaction)=>{await transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`);await transaction.execute(sql`update public.tribe_member_subscriptions set status='canceled' where id=${fixture.subscriptionId}`);});
      const admissionRequestId=await seedPendingPaidAdmission(database,fixture);
      const failingFactory:PaidAdmissionResolutionFactory=(transaction)=>({resolvePaidMembership:async(scope)=>{await createPaidAdmissionResolutionWriter(transaction).resolvePaidMembership(scope);throw new Error("Synthetic payment/admission co-commit failure");}});
      await expect(createRepository(database,fixture.own,"authorized",failingFactory).reconcileProviderSubscribers({priceId:fixture.priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton})).rejects.toThrow();
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select status,status_reason from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows).toEqual([{status:"removed",status_reason:"subscription_inactive"}]);
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${admissionRequestId}`)).rows).toEqual([{status:"pending",version:1}]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.subscription_membership_effects where tribe_id=${fixture.tribeId}) as paid_effects,(select count(*)::int from public.academy_admission_decisions where request_id=${admissionRequestId}) as decisions,(select count(*)::int from public.notifications where tribe_id=${fixture.tribeId}) as notices`)).rows).toEqual([{paid_effects:0,decisions:0,notices:0}]);
      });
    });
  },240_000);

  it("should expire an overdue pending request during paid recovery without resetting its deadline or approving it",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      process.stdout.write(JSON.stringify({phase:"owned_paid_admission_expiry_branch",branch:database.branch})+"\n");
      const fixture=await seedReconciliation(database,"membership","muted");
      await activateProtectedTribe(database,fixture);
      await database.withContext(fixture.own,async(transaction)=>{await transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`);await transaction.execute(sql`update public.tribe_member_subscriptions set status='canceled' where id=${fixture.subscriptionId}`);});
      const admissionRequestId=await seedPendingPaidAdmission(database,fixture,true);
      await createRepository(database,fixture.own,"authorized").reconcileProviderSubscribers({priceId:fixture.priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton});
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select status,version,cancel_reason,expires_at<=clock_timestamp() as overdue from public.academy_admission_requests where id=${admissionRequestId}`)).rows).toEqual([{status:"expired",version:2,cancel_reason:null,overdue:true}]);
        expect((await transaction.execute(sql`select outcome,actor_kind,rule,membership_effect_id from public.academy_admission_decisions where request_id=${admissionRequestId}`)).rows).toEqual([{outcome:"expired",actor_kind:"system",rule:"expired",membership_effect_id:null}]);
        expect((await transaction.execute(sql`select type from public.notifications where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.userId}`)).rows).toEqual([{type:"admission_expired"}]);
      });
    });
  },240_000);

  it.each(["price","diagnostics","member"] as const)("should resolve pending admission after legitimate membership recovery through %s in the owner's original transaction",async(entrypoint)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      process.stdout.write(JSON.stringify({phase:"owned_paid_admission_hook_branch",entrypoint,branch:database.branch})+"\n");
      const fixture=await seedReconciliation(database,"membership","muted");
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.tribeId},'academy',true)`));
      await activateProtectedTribe(database,fixture);
      const admissionRequestId=randomUUID();
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`);
        await transaction.execute(sql`update public.tribe_member_subscriptions set status='canceled' where id=${fixture.subscriptionId}`);
        await transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,applicant_message,submitted_at,expires_at) select ${admissionRequestId},${fixture.tribeId},${fixture.userId},'common','email',${`${fixture.userId}@example.test`},'declared','{"version":1,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":false}'::jsonb,'Presentación anterior',now,now+interval '30 days' from instant`);
      });
      const unexpected=async()=>{throw new Error("Paid admission hook unexpectedly invoked a provider mutation");};
      if(entrypoint==="member"){
        const repository=new PostgresTribeMemberSubscriptionRepository((callback)=>database.withContext(fixture.own,callback),unexpected,unexpected,async()=>"authorized",unexpected,unexpected,unexpected,createPaidAdmissionResolutionWriter,randomUUID());
        expect(await repository.handleWebhook({eventId:randomUUID(),resourceId:fixture.providerId,topic:"subscription_preapproval"})).toMatchObject({status:"processed"});
      }else{
        const repository=createRepository(database,fixture.own,"authorized");
        if(entrypoint==="price")await repository.reconcileProviderSubscribers({priceId:fixture.priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton});
        else await repository.reconcileSubscriberDiagnostics({tribeSlug:fixture.slug});
      }
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select role,status,status_reason from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows).toEqual([{role:"tribemate",status:"muted",status_reason:"none"}]);
        expect((await transaction.execute(sql`select status,version,cancel_reason,applicant_message from public.academy_admission_requests where id=${admissionRequestId}`)).rows).toEqual([{status:"cancelled",version:2,cancel_reason:"external_resolution",applicant_message:"Presentación anterior"}]);
        expect((await transaction.execute(sql`select outcome,actor_kind,actor_user_id,rule,membership_effect_id from public.academy_admission_decisions where request_id=${admissionRequestId}`)).rows).toEqual([{outcome:"cancelled",actor_kind:"system",actor_user_id:null,rule:"external_resolution",membership_effect_id:null}]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_notification_obligations where request_id=${admissionRequestId} and event_type='cancelled') as obligations,(select count(*)::int from public.notifications where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.userId} and type='admission_cancelled') as notices,(select count(*)::int from public.academy_admission_membership_effects where request_id=${admissionRequestId}) as admission_effects`)).rows).toEqual([{obligations:1,notices:1,admission_effects:0}]);
      });
    });
    process.stdout.write(JSON.stringify({phase:"paid_admission_hook_cleanup_verified",entrypoint})+"\n");
  },240_000);

  it.each(["price","diagnostics","member"] as const)("should recover a protected commercial muted instance through %s only from a current membership subscription source",async(entrypoint)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,"membership","muted");
      await activateProtectedTribe(database,fixture);
      const original=await database.withContext(fixture.own,async(transaction)=>{
        const member=(await transaction.execute<{id:string;created_at:Date|string}>(sql`select id,created_at from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows[0];
        await transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where id=${member.id}`);
        await transaction.execute(sql`update public.tribe_member_subscriptions set status='canceled' where id=${fixture.subscriptionId}`);
        return member;
      });
      const unexpected=async()=>{throw new Error("Paid provenance test unexpectedly invoked a provider mutation");};
      if(entrypoint==="member") {
        const repository=new PostgresTribeMemberSubscriptionRepository((callback)=>database.withContext(fixture.own,callback),unexpected,unexpected,async()=>"authorized",unexpected,unexpected,unexpected,createPaidAdmissionResolutionWriter,randomUUID());
        expect(await repository.handleWebhook({eventId:randomUUID(),resourceId:fixture.providerId,topic:"subscription_preapproval"})).toMatchObject({status:"processed"});
      } else {
        const repository=createRepository(database,fixture.own,"authorized");
        if(entrypoint==="price") await repository.reconcileProviderSubscribers({priceId:fixture.priceId,tribeSlug:fixture.slug,source:TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton});
        else await repository.reconcileSubscriberDiagnostics({tribeSlug:fixture.slug});
      }
      await database.withContext(fixture.own,async(transaction)=>{
        const member=(await transaction.execute(sql`select id,role,status,status_reason,created_at,commercial_recovery_status from public.tribe_members where id=${original.id}`)).rows;
        expect(member).toEqual([{id:original.id,role:"tribemate",status:"muted",status_reason:"none",created_at:original.created_at,commercial_recovery_status:"muted"}]);
        const sources=(await transaction.execute(sql`select source.subscription_id,source.member_id,source.target_status,source.applied_at is not null as consumed,source.revoked_at from public.subscription_membership_effects source join public.tribe_members member on member.subscription_membership_effect_id=source.id where member.id=${original.id}`)).rows;
        expect(sources).toEqual([{subscription_id:fixture.subscriptionId,member_id:original.id,target_status:"muted",consumed:true,revoked_at:null}]);
        expect((await transaction.execute(sql`select id from public.academy_admission_decisions where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
      });
    });
  },180_000);

  it.each([
    {name:"unknown commercial history",product:"membership" as const,state:"removed" as const,reason:"subscription_inactive",privileged:false},
    {name:"conduct moderation",product:"membership" as const,state:"blocked" as const,reason:"conduct_blocked",privileged:false},
    {name:"an administrative removal",product:"membership" as const,state:"removed" as const,reason:"none",privileged:false},
    {name:"a dormant privileged role",product:"membership" as const,state:"muted" as const,reason:"none",privileged:true},
    {name:"an academy commercial product",product:"academy" as const,state:"muted" as const,reason:"none",privileged:false},
  ])("should keep protected membership closed for $name despite an authorized provider status",async({product,state,reason,privileged})=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,product,state,reason);
      await activateProtectedTribe(database,fixture);
      if(privileged||product==="academy") await database.withContext(fixture.own,async(transaction)=>{
        if(privileged) await transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`);
        await transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`);
      });
      const before=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select role,status,status_reason,created_at,commercial_recovery_status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows);
      await createRepository(database,fixture.own,"authorized").reconcileSubscriberDiagnostics({tribeSlug:fixture.slug});
      const after=await database.withContext(fixture.own,async(transaction)=>({
        members:(await transaction.execute(sql`select role,status,status_reason,created_at,commercial_recovery_status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows,
        sources:(await transaction.execute(sql`select id from public.subscription_membership_effects where tribe_id=${fixture.tribeId}`)).rows,
      }));
      expect(after).toEqual({members:before,sources:[]});
    });
  },180_000);

  it("should consume each current paid source once, retain the instance across billing and archive it after noncommercial removal",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,"membership","muted");
      await activateProtectedTribe(database,fixture);
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      const restore=()=>createRepository(database,fixture.own,"authorized").reconcileSubscriberDiagnostics({tribeSlug:fixture.slug});
      await restore();
      await restore();
      const first=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute<{id:string;subscription_membership_effect_id:string}>(sql`select id,subscription_membership_effect_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows[0]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select count(*)::int as count from public.subscription_membership_effects where member_id=${first.id}`)).rows)).toEqual([{count:1}]);
      await createRepository(database,fixture.own,"cancelled").reconcileSubscriberDiagnostics({tribeSlug:fixture.slug});
      await expect(database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set status='muted',status_reason='none' where id=${first.id}`))).rejects.toMatchObject({cause:{code:"23514"}});
      await restore();
      const second=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute<{id:string;subscription_membership_effect_id:string}>(sql`select id,subscription_membership_effect_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows[0]);
      expect(second.id).toBe(first.id);
      expect(second.subscription_membership_effect_id).not.toBe(first.subscription_membership_effect_id);
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set status='removed',status_reason='none' where id=${second.id}`));
      await restore();
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select status,status_reason from public.tribe_members where id=${second.id}`)).rows).toEqual([{status:"removed",status_reason:"none"}]);
        expect((await transaction.execute(sql`select revoked_at is not null as revoked from public.subscription_membership_effects where id in (${first.subscription_membership_effect_id},${second.subscription_membership_effect_id}) order by id`)).rows).toEqual([{revoked:true},{revoked:true}]);
        await transaction.execute(sql`delete from public.tribe_members where id=${second.id}`);
      });
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select member_id,revoked_at is not null as revoked from public.subscription_membership_effects where id in (${first.subscription_membership_effect_id},${second.subscription_membership_effect_id}) order by id`)).rows)).toEqual([{member_id:null,revoked:true},{member_id:null,revoked:true}]);
    });
  },240_000);

  it("should reread webhook replay state after a concurrent subscription change during its provider read",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await seedReconciliation(database,"membership","muted");
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`insert into public.subscription_idempotency_operations(operation_key,operation_type,payload_hash,response_body) values (${`mercado-pago-webhook:${fixture.providerId}:active:none`},'mercado_pago_webhook',${randomUUID()},'{}')`));
      const unexpected=async()=>{throw new Error("Reconciliation test unexpectedly invoked a provider mutation");};
      const providerRead=async()=>{
        await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.tribe_member_subscriptions set status='paused',updated_at=clock_timestamp() where id=${fixture.subscriptionId}`));
        return "authorized";
      };
      const repository=new PostgresTribeMemberSubscriptionRepository((callback)=>database.withContext(fixture.own,callback),unexpected,unexpected,providerRead,unexpected,unexpected,unexpected,createPaidAdmissionResolutionWriter,randomUUID());
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
      const repository=new PostgresTribeMemberSubscriptionRepository((callback)=>database.withContext({userId:fixture.userId,email:null},callback),unexpected,unexpected,async()=>"authorized",unexpected,unexpected,unexpected,createPaidAdmissionResolutionWriter,randomUUID());
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
