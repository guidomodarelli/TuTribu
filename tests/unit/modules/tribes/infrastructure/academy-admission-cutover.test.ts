/** @vitest-environment node */

/** Exercises protected membership provenance with PostgreSQL and the actual runtime role. */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";

/** Creates historical rows before the new migration without inventing recovery snapshots. */
async function prepareCutover(database: AcademyAdmissionTestDatabase) {
  for (const artifact of ["20261005090000_create_admission_identity_evidence.sql","20261005091000_create_academy_admission_core.sql","20261005091500_guard_admission_evidence_transitions.sql","20261005092000_create_tenant_messaging.sql","20261005092500_guard_messaging_attempts.sql"]) await database.applyMigration(artifact);
  const tribeId=randomUUID(); const leaderId=randomUUID(); const applicantId=randomUUID(); const mutedId=randomUUID(); const unknownId=randomUUID();
  const own={userId:leaderId,email:null};
  await database.withContext(own,async (transaction)=>{
    for (const userId of [leaderId,applicantId,mutedId,unknownId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic cutover account',${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic protected academy',${`cutover-${tribeId}`},${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,status_reason) values (${tribeId},${leaderId},'leader','active','none'),(${tribeId},${mutedId},'tribemate','muted','none'),(${tribeId},${unknownId},'tribemate','removed','subscription_inactive')`);
  });
  await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
  return {tribeId,leaderId,applicantId,mutedId,unknownId,own};
}

/** Sets the first activation and its policy to the same persisted instant in one transaction. */
async function activateCutover(database: AcademyAdmissionTestDatabase,fixture: Awaited<ReturnType<typeof prepareCutover>>) {
  await database.withContext(fixture.own,async (transaction)=>{
    const instant=(await transaction.execute(sql`select clock_timestamp() as instant`)).rows[0].instant;
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${fixture.tribeId},true,${instant})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${fixture.tribeId}`);
  });
}

/** Commits the structural decision/source/member/notice/audit cycle; application supplies eligibility. */
async function commitBasicAdmission(database: AcademyAdmissionTestDatabase,fixture: Awaited<ReturnType<typeof prepareCutover>>,userId: string,targetStatus: "active"|"muted",includeMembership=true) {
  const requestId=randomUUID(); const decisionId=randomUUID(); const effectId=randomUUID();
  return database.withContext(fixture.own,async (transaction)=>{
    const existing=(await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${userId}`)).rows[0];
    const memberId=existing?.id??randomUUID();
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${fixture.tribeId},${userId},'common',clock_timestamp()+interval '29 days')`);
    await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,membership_effect_id) values (${decisionId},${requestId},${fixture.tribeId},${userId},1,'approved',${fixture.leaderId},'user','synthetic_manual_review',1,1,${effectId})`);
    await transaction.execute(sql`insert into public.academy_admission_membership_effects(id,decision_id,request_id,tribe_id,user_id,member_id,target_status) values (${effectId},${decisionId},${requestId},${fixture.tribeId},${userId},${memberId},${targetStatus})`);
    await transaction.execute(sql`update public.academy_admission_requests set status='approved',decision_id=${decisionId},version=version+1 where id=${requestId}`);
    await transaction.execute(sql`insert into public.academy_admission_notification_obligations(tribe_id,request_id,applicant_user_id,event_type) values (${fixture.tribeId},${requestId},${userId},'approved')`);
    await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type) values (${fixture.tribeId},${fixture.leaderId},'admission_request',${requestId},'approved')`);
    if (includeMembership) {
      if (existing) await transaction.execute(sql`update public.tribe_members set status=${targetStatus},status_reason='none',admission_membership_effect_id=${effectId} where id=${memberId}`);
      else await transaction.execute(sql`insert into public.tribe_members(id,tribe_id,user_id,role,status,status_reason,admission_membership_effect_id) values (${memberId},${fixture.tribeId},${userId},'tribemate',${targetStatus},'none',${effectId})`);
    }
    return {requestId,decisionId,effectId,memberId};
  });
}

/** Observes real transaction ordering and drains every started worker even when a barrier producer fails. */
async function observeCutoverRace(database:AcademyAdmissionTestDatabase,fixture:Awaited<ReturnType<typeof prepareCutover>>,failureStage?:"legacy"|"activation") {
      let releaseLegacy:()=>void=()=>{}; let reportInserted:()=>void=()=>{};
      const release=new Promise<void>((resolve)=>{releaseLegacy=resolve;});
      const inserted=new Promise<void>((resolve)=>{reportInserted=resolve;});
      const legacy=database.withContext(fixture.own,async (transaction)=>{
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${failureStage==="legacy"?fixture.leaderId:fixture.applicantId},'tribemate','active')`);
        reportInserted(); await release;
      });
      let activationFinished=false; let reportUpdating:()=>void=()=>{};
      const updating=new Promise<void>((resolve)=>{reportUpdating=resolve;});
      const applicationName=`cutover-activation-${randomUUID()}`;
      let activation:Promise<void>|undefined; let workFailed=false; let workError:unknown;
      try {
        // A failed producer must reject its barrier wait, not leave it pending.
        await Promise.race([inserted,legacy]);
        activation=database.withContext(fixture.own,async (transaction)=>{
        const instant=(await transaction.execute(sql`select clock_timestamp() as instant`)).rows[0].instant;
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${fixture.tribeId},true,${instant})`);
        await transaction.execute(sql`select set_config('application_name',${applicationName},true)`);
        reportUpdating();
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${fixture.tribeId}`);
        }).then(()=>{activationFinished=true;});
        await Promise.race([updating,activation]);
        let waitingForLock=false;
        const observeUntil=Date.now()+5_000;
        while(!activationFinished && Date.now()<observeUntil) {
          const activity=await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select wait_event_type from pg_stat_activity where datname=current_database() and application_name=${applicationName}`)).rows);
          waitingForLock=activity.some((row)=>row.wait_event_type==="Lock");
          if(waitingForLock) break;
          await delay(25);
        }
        expect(activationFinished).toBe(false);
        expect(waitingForLock).toBe(true);
      } catch(error) {
        workFailed=true; workError=error;
      } finally {
        releaseLegacy();
        const completed=await Promise.allSettled(activation?[legacy,activation]:[legacy]);
        const failedWorker=completed.find((result)=>result.status==="rejected");
        if(!workFailed && failedWorker?.status==="rejected") {workFailed=true;workError=failedWorker.reason;}
      }
      if(workFailed) throw workError;
      expect(activationFinished).toBe(true);
      expect(await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId}`)).rows)).toEqual([{status:"active"}]);
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("academy membership cutover",()=>{
  it("should serialize activation after a legacy admission already in flight",async ()=>{
    await withAcademyAdmissionDatabase(async (database)=>observeCutoverRace(database,await prepareCutover(database)));
  },120_000);

  it.each(["legacy","activation"] as const)("should drain workers and finish cleanup when the %s barrier producer fails",async (failureStage)=>{
    await withAcademyAdmissionDatabase(async (database)=>{
      const fixture=await prepareCutover(database);
      if(failureStage==="activation") await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`insert into public.academy_admission_policies(tribe_id) values (${fixture.tribeId})`));
      await expect(observeCutoverRace(database,fixture,failureStage)).rejects.toMatchObject({cause:{code:"23505"}});
    });
  },120_000);

  it("should close the legacy academy selector after activation while preserving a real membership-product selector",async ()=>{
    await withAcademyAdmissionDatabase(async (database)=>{
      const fixture=await prepareCutover(database);
      const slug=await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select slug from public.tribes where id=${fixture.tribeId}`)).rows[0].slug);
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.tribeId},'academy',true)`));
      const lookup=()=>database.withContext({userId:fixture.applicantId,email:null},async (transaction)=>(await transaction.execute(sql`select public.tribe_academy_admission_id_by_slug(${slug}) as tribe_id`)).rows);
      expect(await lookup()).toEqual([{tribe_id:fixture.tribeId}]);
      await activateCutover(database,fixture);
      expect(await lookup()).toEqual([{tribe_id:null}]);
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`delete from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`));
      expect(await lookup()).toEqual([{tribe_id:null}]);
      const classicId=randomUUID(); const classicSlug=`classic-cutover-${classicId}`; const priceId=randomUUID();
      await database.withContext(fixture.own,async (transaction)=>{
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by,free_join_is_current) values (${classicId},'Synthetic classic tribe',${classicSlug},${fixture.leaderId},false)`);
        await transaction.execute(sql`insert into public.tribe_subscription_prices(id,tribe_id,name,amount_cents,currency,frequency,status,is_current,mercado_pago_preapproval_plan_id,product_key,created_by) values (${priceId},${classicId},'Synthetic membership price',100,'ARS','monthly','active',true,'synthetic-plan','membership',${fixture.leaderId})`);
      });
      const paidLookup=()=>database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select public.tribe_open_join_id_by_slug(${classicSlug}) as tribe_id`)).rows);
      expect(await paidLookup()).toEqual([{tribe_id:classicId}]);
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`update public.tribe_subscription_prices set product_key='academy' where id=${priceId}`));
      expect(await paidLookup()).toEqual([{tribe_id:null}]);
    });
  },120_000);

  it("should retain the activation marker and close raw legacy writes after policy loss or a false execution flag",async ()=>{
    await withAcademyAdmissionDatabase(async (database)=>{
      const fixture=await prepareCutover(database);
      await activateCutover(database,fixture);
      await expect(database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`update public.tribes set admissions_control_activated_at=null where id=${fixture.tribeId}`))).rejects.toMatchObject({cause:{code:"23514"}});
      const write=()=>database.withContext(fixture.own,async (transaction)=>{
        await transaction.execute(sql`select set_config('app.academy_admissions_enabled','false',true),set_config('app.paid','true',true)`);
        return transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${fixture.applicantId},'tribemate','active')`);
      });
      await expect(write()).rejects.toMatchObject({cause:{code:"23514"}});
      await database.grantTablesToNonBypass(["tribe_members"]);
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`grant select on public.tribes,public.tribe_invitations,public.tribe_subscription_prices to ${sql.identifier(database.nonBypassRole.name)}`));
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`grant execute on function public.can_open_join_tribe_free(uuid),public.can_open_join_tribe_paid_plan(uuid) to ${sql.identifier(database.nonBypassRole.name)}`));
      await expect(database.withContext({userId:fixture.applicantId,email:null},async (transaction)=>transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${fixture.applicantId},'tribemate','active')`),"non_bypass")).rejects.toMatchObject({cause:{code:"23514",message:"protected membership requires a basic admission source"}});
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`delete from public.academy_admission_policies where tribe_id=${fixture.tribeId}`));
      await expect(write()).rejects.toMatchObject({cause:{code:"23514"}});
      expect(await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId}`)).rows)).toEqual([]);
      // Normal creation before activation keeps the owner bootstrap available.
      const legacyId=randomUUID();
      await database.withContext(fixture.own,async (transaction)=>{
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${legacyId},'Synthetic legacy tribe',${`legacy-cutover-${legacyId}`},${fixture.leaderId})`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${legacyId},${fixture.leaderId},'leader','active')`);
      });
      expect(await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${legacyId}`)).rows)).toEqual([{role:"leader",status:"active"}]);
      await expect(database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`update public.tribe_members set tribe_id=${legacyId},created_at=clock_timestamp() where tribe_id=${fixture.tribeId} and user_id=${fixture.mutedId}`))).rejects.toMatchObject({cause:{code:"23514"}});
    });
  },120_000);

  it("should archive a deleted member instance and require a new decision to rejoin",async ()=>{
    await withAcademyAdmissionDatabase(async (database)=>{
      const fixture=await prepareCutover(database);
      await activateCutover(database,fixture);
      const admitted=await commitBasicAdmission(database,fixture,fixture.applicantId,"active");
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`delete from public.tribe_members where id=${admitted.memberId}`));
      expect(await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select member_id,revoked_at is not null as revoked from public.academy_admission_membership_effects where id=${admitted.effectId}`)).rows)).toEqual([{member_id:null,revoked:true}]);
      await expect(database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`insert into public.tribe_members(id,tribe_id,user_id,role,status,admission_membership_effect_id) values (${admitted.memberId},${fixture.tribeId},${fixture.applicantId},'tribemate','active',${admitted.effectId})`))).rejects.toMatchObject({cause:{code:"23514"}});
      const next=await commitBasicAdmission(database,fixture,fixture.applicantId,"active");
      expect(next.memberId).not.toBe(admitted.memberId);
      expect(next.effectId).not.toBe(admitted.effectId);
    });
  },120_000);

  it("should capture muted before a commercial block and leave historical unknown recovery closed",async ()=>{
    await withAcademyAdmissionDatabase(async (database)=>{
      const fixture=await prepareCutover(database);
      const before=await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select created_at from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.mutedId}`)).rows[0].created_at);
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='payment_blocked' where tribe_id=${fixture.tribeId} and user_id=${fixture.mutedId}`));
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where tribe_id=${fixture.tribeId} and user_id=${fixture.mutedId}`));
      expect(await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select commercial_recovery_status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.unknownId}`)).rows)).toEqual([{commercial_recovery_status:null}]);
      await activateCutover(database,fixture);
      await expect(commitBasicAdmission(database,fixture,fixture.unknownId,"active")).rejects.toMatchObject({cause:{code:"23514"}});
      await commitBasicAdmission(database,fixture,fixture.mutedId,"muted");
      expect(await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select role,status,commercial_recovery_status,created_at from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.mutedId}`)).rows)).toEqual([{role:"tribemate",status:"muted",commercial_recovery_status:"muted",created_at:before}]);
    });
  },120_000);

  it("should commit decision and membership once, preserve its basic basis against billing and revoke it on removal",async ()=>{
    await withAcademyAdmissionDatabase(async (database)=>{
      const fixture=await prepareCutover(database);
      await activateCutover(database,fixture);
      await expect(commitBasicAdmission(database,fixture,fixture.applicantId,"active",false)).rejects.toMatchObject({code:"23503"});
      expect(await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select id from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId}`)).rows)).toEqual([]);
      const admitted=await commitBasicAdmission(database,fixture,fixture.applicantId,"active");
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where id=${admitted.memberId}`));
      expect(await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select status,admission_membership_effect_id from public.tribe_members where id=${admitted.memberId}`)).rows)).toEqual([{status:"active",admission_membership_effect_id:admitted.effectId}]);
      await database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`update public.tribe_members set status='removed',status_reason='none' where id=${admitted.memberId}`));
      const revoked=await database.withContext(fixture.own,async (transaction)=>(await transaction.execute(sql`select revoked_at is not null as revoked from public.academy_admission_membership_effects where id=${admitted.effectId}`)).rows);
      expect(revoked).toEqual([{revoked:true}]);
      await expect(database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`update public.tribe_members set status='active',status_reason='none',admission_membership_effect_id=${admitted.effectId} where id=${admitted.memberId}`))).rejects.toMatchObject({cause:{code:"23514"}});
      await expect(database.withContext(fixture.own,async (transaction)=>transaction.execute(sql`update public.academy_admission_membership_effects set revoked_at=null,revocation_reason=null where id=${admitted.effectId}`))).rejects.toMatchObject({cause:{code:"23514"}});
    });
  },120_000);
});
