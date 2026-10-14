/** @vitest-environment node */
/** Exercises actual submission, fixed notice facts, original ledger and public metrics on an owned branch. @module admission-notification-audit-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { TRIBE_LIFECYCLE_AUDIT_MIGRATIONS } from "@/tests/support/constants/tribe-lifecycle-audit";
import { PostgresAdmissionActivityReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activity-reader";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("native admission notification facts",()=>{
  it("should preserve the real submit ledger for each current reviewer and avoid facts or samples on replay",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const {fixture,applicant,historicalApplicant:guardian}=await prepareAllowlistAdmission(database,undefined,"active","guardian");
      if(!guardian)throw new Error("Expected a legitimate guardian before admission cutover");
      for(const migration of [...TRIBE_LIFECYCLE_AUDIT_MIGRATIONS,"20261014134826_read_admission_activity_and_metrics.sql","20261014173100_read_dispatch_run_metrics.sql","20261014185500_integrate_admission_notification_audit.sql"])await database.applyMigration(migration);
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const user=await applicant(),input={...user.input,expectedPolicyVersion:3};
      expect(await user.commands.submit.execute(input)).toMatchObject({ok:true,value:{state:"completed",result:{outcome:"pending"}}});
      const actual=await database.withContext(fixture.own,async(transaction)=>{
        const original=(await transaction.execute<{id:string}>(sql`select id from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${input.operationId}`)).rows[0];
        const request=(await transaction.execute<{id:string}>(sql`select id from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${user.userId}`)).rows[0];
        const events=(await transaction.execute<{resource_id:string;event_type:string;actor_user_id:string|null;operation_id:string|null;resource_version:number|null;metadata:{obligationId:string;requestId:string;requestVersion:number;sourceEvent:string;audience:string|null;durationMs:number|null}}>(sql`select resource_id,event_type,actor_user_id,operation_id,resource_version,metadata from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_notification'`)).rows;
        expect(events).toHaveLength(3);
        expect(events.every((event)=>event.actor_user_id===user.userId&&event.operation_id===original.id&&event.resource_version===null&&event.metadata.requestId===request.id&&event.metadata.requestVersion===1&&event.metadata.sourceEvent==="pending_created")).toBe(true);
        const creation=events.find((event)=>event.event_type==="notification_obligation_created");if(!creation)throw new Error("Expected original obligation creation fact");
        expect(creation.resource_id).toBe(creation.metadata.obligationId);expect(creation.metadata.audience).toBeNull();expect(creation.metadata.durationMs).toBeNull();
        const notices=events.filter((event)=>event.event_type==="notification_materialized");expect(notices).toHaveLength(2);
        expect((await transaction.execute(sql`select bool_and(event.created_at>=obligation.created_at) as current_clock from public.academy_admission_audit_events event join public.academy_admission_notification_obligations obligation on obligation.id=(event.metadata->>'obligationId')::uuid and obligation.tribe_id=event.tribe_id where event.tribe_id=${fixture.tribeId} and event.resource_type='admission_notification' and event.event_type='notification_materialized'`)).rows).toEqual([{current_clock:true}]);
        for(const notice of notices){expect(notice.metadata.audience).toBe("reviewer");expect(notice.metadata.durationMs).toBeGreaterThanOrEqual(0);expect(Object.keys(notice.metadata).sort()).toEqual(["audience","durationMs","obligationId","requestId","requestVersion","sourceEvent"]);}
        return {originalId:original.id,requestId:request.id,obligationId:creation.metadata.obligationId};
      });
      expect(await user.commands.submit.execute(input)).toMatchObject({ok:true,value:{replayed:true}});
      await expect(database.withContext(fixture.own,(transaction)=>transaction.execute(sql`select public.create_admission_notification_obligation(${randomUUID()},${fixture.tribeId},${actual.requestId},${user.userId},'cancelled',${actual.originalId})`))).rejects.toMatchObject({cause:{code:"42501"}});
      await expect(database.withContext({userId:user.userId,email:null},async(transaction)=>{expect((await transaction.execute(sql`select public.enqueue_admission_notification(${actual.obligationId},${user.userId},'applicant') as inserted`)).rows).toEqual([{inserted:true}]);throw new Error("Controlled admission notice rollback");})).rejects.toThrow("Controlled admission notice rollback");
      await database.withContext(fixture.own,async(transaction)=>{expect((await transaction.execute(sql`select public.enqueue_admission_notification(${actual.obligationId},${guardian.userId},'reviewer') as inserted`)).rows).toEqual([{inserted:false}]);expect((await transaction.execute(sql`select count(*)::integer as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_notification'`)).rows).toEqual([{count:3}]);});
      const reader=new PostgresAdmissionActivityReader((scope,run)=>database.withContext({userId:scope.userId,email:null},run));
      const scope={tribeId:fixture.tribeId,userId:fixture.userId,sessionId:fixture.sessionId,requestId:randomUUID()};
      const metrics=await reader.readMetrics(scope);expect(metrics.durations).toContainEqual(expect.objectContaining({phase:"notification",sampleCount:2,p95Ms:expect.any(Number)}));
      const activity=await reader.readActivity(scope,{limit:50,resourceType:"admission_notification"});expect(activity.items).toHaveLength(3);expect(activity.items.every((event)=>event.operationId===actual.originalId&&event.resourceVersion===null)).toBe(true);
    });
  },600_000);
});
