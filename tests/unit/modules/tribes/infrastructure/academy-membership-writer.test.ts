/** @vitest-environment node */

/** Exercises the membership collaborator inside the real admission decision transaction. */
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase,type AcademyAdmissionTestDatabase} from "@/tests/support/academy-admission-database";
import {PostgresTribeAcademyAdmissionRepository} from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-academy-admission-repository";
import {createAcademyApprovedMembershipWriter} from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";

/** Creates an active leader and an explicitly protected policy on an owned test branch. */
async function prepareWriter(database:AcademyAdmissionTestDatabase,existing?:{role:"guardian"|"tribemate";status:"active"|"muted"|"blocked"|"removed";reason?:string}) {
  for(const migration of ["20261005090000_create_admission_identity_evidence.sql","20261005091000_create_academy_admission_core.sql","20261005091500_guard_admission_evidence_transitions.sql","20261005092000_create_tenant_messaging.sql","20261005092500_guard_messaging_attempts.sql","20261005093000_guard_academy_membership_sources.sql","20261006180000_guard_subscription_membership_sources.sql","20261006200000_scope_admission_audit_operations.sql"]) await database.applyMigration(migration);
  const tribeId=randomUUID();const leaderId=randomUUID();const applicantId=randomUUID();const own={userId:leaderId,email:null};
  await database.withContext(own,async(transaction)=>{
    for(const id of [leaderId,applicantId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${id},'Synthetic writer account',${`${id}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic writer tribe',${`writer-${tribeId}`},${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active')`);
    if(existing) await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,status_reason) values (${tribeId},${applicantId},${existing.role},${existing.status},${existing.reason??"none"})`);
    const instant=(await transaction.execute(sql`select clock_timestamp() as instant`)).rows[0].instant;
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${instant})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${tribeId}`);
  });
  return {tribeId,leaderId,applicantId,own};
}

/** Supplies the other owners' structural effects in the same transaction as membership. */
async function stageApprovedDecision(database:Parameters<PostgresTribeAcademyAdmissionRepository["applyApprovedDecision"]>[0],fixture:Awaited<ReturnType<typeof prepareWriter>>) {
  const requestId=randomUUID();const decisionId=randomUUID();const effectId=randomUUID();
  await database.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${fixture.tribeId},${fixture.applicantId},'common',clock_timestamp()+interval '29 days')`);
  await database.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,membership_effect_id) values (${decisionId},${requestId},${fixture.tribeId},${fixture.applicantId},1,'approved',${fixture.leaderId},'user','synthetic_manual_review',1,1,${effectId})`);
  await database.execute(sql`update public.academy_admission_requests set status='approved',decision_id=${decisionId},version=version+1 where id=${requestId}`);
  await database.execute(sql`insert into public.academy_admission_notification_obligations(tribe_id,request_id,applicant_user_id,event_type) values (${fixture.tribeId},${requestId},${fixture.applicantId},'approved')`);
  await database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type) values (${fixture.tribeId},${fixture.leaderId},'admission_request',${requestId},'approved')`);
  return {tribeId:fixture.tribeId,userId:fixture.applicantId,decisionId};
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("academy membership writer",()=>{
  it("should reject admission when academy mode changes during a membership lock wait",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareWriter(database);
      const applicationName=`membership-mode-race-${randomUUID()}`;
      let releaseBlocker:()=>void=()=>{};let reportLocked:()=>void=()=>{};
      const release=new Promise<void>((resolve)=>{releaseBlocker=resolve;});
      const locked=new Promise<void>((resolve)=>{reportLocked=resolve;});
      const blocker=database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.leaderId} for share`);
        reportLocked();await release;
        await transaction.execute(sql`update public.tribe_academy_settings set access_model='legacy',admission_enabled=false where tribe_id=${fixture.tribeId}`);
      });
      let observedResult:unknown;let writer:Promise<unknown>|undefined;let completed:PromiseSettledResult<unknown>[]=[];
      try {
        await Promise.race([locked,blocker]);
        writer=database.withContext(fixture.own,async(transaction)=>{
          await transaction.execute(sql`select set_config('application_name',${applicationName},true)`);
          observedResult=await createAcademyApprovedMembershipWriter(transaction).apply(await stageApprovedDecision(transaction,fixture));
          return observedResult;
        });
        // Observe the real PostgreSQL wait before changing settings; elapsed time alone is insufficient.
        const observeUntil=Date.now()+5_000;let waitingForLock=false;
        while(Date.now()<observeUntil) {
          const activity=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select wait_event_type from pg_stat_activity where datname=current_database() and application_name=${applicationName}`)).rows);
          waitingForLock=activity.some((row)=>row.wait_event_type==="Lock");
          if(waitingForLock) break;
          await delay(25);
        }
        expect(waitingForLock).toBe(true);
      } finally {
        releaseBlocker();
        completed=await Promise.allSettled(writer?[blocker,writer]:[blocker]);
      }
      expect(completed[0].status).toBe("fulfilled");
      expect(observedResult).toEqual({status:"admission_closed"});
      expect(completed[1]).toMatchObject({status:"rejected",reason:{code:"23503"}});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId}`)).rows)).toEqual([]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}`)).rows)).toEqual([]);
    });
  },120_000);

  it("should reject a mismatched actor and missing decision without granting membership",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareWriter(database);
      const command={tribeId:fixture.tribeId,userId:fixture.applicantId,decisionId:randomUUID()};
      expect(await database.withContext({userId:fixture.applicantId,email:null},async(transaction)=>createAcademyApprovedMembershipWriter(transaction).apply(command))).toEqual({status:"admission_closed"});
      expect(await database.withContext({userId:null,email:null},async(transaction)=>createAcademyApprovedMembershipWriter(transaction).apply(command))).toEqual({status:"admission_closed"});
      expect(await database.withContext(fixture.own,async(transaction)=>createAcademyApprovedMembershipWriter(transaction).apply(command))).toEqual({status:"admission_closed"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId}`)).rows)).toEqual([]);
    });
  },120_000);

  it.each(["paused","missing_policy","mode_exit","lost_leadership"] as const)("should keep a staged decision closed after %s without consuming its source",async(change)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareWriter(database);
      if(change==="paused") await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      if(change==="missing_policy") await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`delete from public.academy_admission_policies where tribe_id=${fixture.tribeId}`));
      if(change==="mode_exit") await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.tribe_academy_settings set access_model='legacy',admission_enabled=false where tribe_id=${fixture.tribeId}`));
      if(change==="lost_leadership") await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.leaderId}`));
      await expect(database.withContext(fixture.own,async(transaction)=>createAcademyApprovedMembershipWriter(transaction).apply(await stageApprovedDecision(transaction,fixture)))).rejects.toMatchObject({code:"23503"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId}`)).rows)).toEqual([]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.academy_admission_requests where tribe_id=${fixture.tribeId}`)).rows)).toEqual([]);
    });
  },120_000);

  it("should commit the approved source and a new basic member atomically without commercial grants",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareWriter(database);
      const repository=new PostgresTribeAcademyAdmissionRepository((callback)=>database.withContext(fixture.own,callback));
      const result=await database.withContext(fixture.own,async(transaction)=>repository.applyApprovedDecision(transaction,await stageApprovedDecision(transaction,fixture)));
      expect(result).toMatchObject({status:"joined",member:{role:"tribemate",status:"active"}});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select applied_at is not null as applied,revoked_at from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId}`)).rows)).toEqual([{applied:true,revoked_at:null}]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.member_access_grants where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId}`)).rows)).toEqual([]);
    });
  },120_000);

  it("should return an existing muted guardian before consulting or consuming another decision",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareWriter(database,{role:"guardian",status:"muted"});
      const repository=new PostgresTribeAcademyAdmissionRepository((callback)=>database.withContext(fixture.own,callback));
      const result=await database.withContext(fixture.own,async(transaction)=>repository.applyApprovedDecision(transaction,{tribeId:fixture.tribeId,userId:fixture.applicantId,decisionId:randomUUID()}));
      expect(result).toMatchObject({status:"already_member",member:{role:"guardian",status:"muted"}});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}`)).rows)).toEqual([]);
    });
  },120_000);

  it("should restore the observed muted snapshot and keep the original member identity and date",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareWriter(database,{role:"tribemate",status:"muted"});
      const before=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id,created_at from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.applicantId}`)).rows[0]);
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.tribe_members set status='blocked',status_reason='payment_blocked' where id=${before.id}`));
      const repository=new PostgresTribeAcademyAdmissionRepository((callback)=>database.withContext(fixture.own,callback));
      expect(await database.withContext(fixture.own,async(transaction)=>repository.applyApprovedDecision(transaction,await stageApprovedDecision(transaction,fixture)))).toMatchObject({status:"joined",member:{id:before.id,status:"muted",role:"tribemate"}});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id,created_at from public.tribe_members where id=${before.id}`)).rows[0])).toEqual(before);
    });
  },120_000);

  it.each([
    {role:"tribemate",status:"blocked",reason:"conduct_blocked"},
    {role:"tribemate",status:"removed",reason:"none"},
    {role:"guardian",status:"removed",reason:"subscription_inactive"},
    {role:"tribemate",status:"blocked",reason:"payment_blocked"},
  ] as const)("should deny $role/$status/$reason without creating a source",async(existing)=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareWriter(database,existing);
      const repository=new PostgresTribeAcademyAdmissionRepository((callback)=>database.withContext(fixture.own,callback));
      expect(await database.withContext(fixture.own,async(transaction)=>repository.applyApprovedDecision(transaction,{tribeId:fixture.tribeId,userId:fixture.applicantId,decisionId:randomUUID()}))).toEqual({status:"blocked"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}`)).rows)).toEqual([]);
    });
  },120_000);
});
