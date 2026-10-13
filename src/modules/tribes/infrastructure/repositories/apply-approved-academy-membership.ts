/** Consumes a persisted admission decision using the caller's existing transaction. */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {ACADEMY_MEMBERSHIP_DECISION,ACADEMY_MEMBERSHIP_ELIGIBILITY} from "@/src/modules/tribes/constants/academy-membership";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {TRIBE_MEMBERSHIP_STATUS,TRIBE_MEMBERSHIP_STATUS_REASON} from "@/src/modules/tribes/constants/tribe-page-access";
import {TRIBE_MEMBER_ACADEMY_ADMISSION_SOURCE} from "@/src/modules/tribes/constants/tribe-story";
import {TRIBE_ACCESS_MODEL} from "@/src/modules/product-access/constants/product-access";
import {evaluateAcademyMembershipEligibility,type AcademyMembershipFacts} from "@/src/modules/tribes/domain/value-objects/academy-membership-eligibility";
import type {AcademyApprovedMembershipWriter,ApplyApprovedAcademyMembershipCommand,ApplyApprovedAcademyMembershipResult} from "@/src/modules/tribes/domain/repositories/academy-approved-membership-writer";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Fields consumed from owned storage; no backend schema revalidation is performed. */
type MemberRow={id:string;user_id:string;role:AcademyMembershipFacts["role"];status:AcademyMembershipFacts["status"];status_reason:string;commercial_recovery_status:"active"|"muted"|null;created_at:string};

/** Maps the consumed persisted fields into the owner's internal facts. */
function mapMember(row:MemberRow):AcademyMembershipFacts {
  return {id:row.id,role:row.role,status:row.status,statusReason:row.status_reason,commercialRecoveryStatus:row.commercial_recovery_status,createdAt:new Date(row.created_at)};
}

/**
 * Applies a scoped approved decision without starting another transaction or any RPC.
 * @param database - The authoritative admission writer's guarded transaction.
 * @param command - Internal account/tribe/decision identity, never a permission flag.
 * @returns Existing readable state or the basic member; invalid scope stays closed.
 * @remarks The caller commits request, decision, contact effects, audit and notice together.
 */
export async function applyApprovedAcademyMembership(database:RequestDatabase,command:ApplyApprovedAcademyMembershipCommand):Promise<ApplyApprovedAcademyMembershipResult> {
  const tribe=(await database.execute<{id:string;admissions_control_activated_at:string|null}>(sql`select id,admissions_control_activated_at from public.tribes where id=${command.tribeId} for update`)).rows[0];
  if(!tribe) return {status:"admission_closed"};
  const policy=(await database.execute<{version:number;verification_epoch:number;is_open:boolean;activated_at:string|null}>(sql`select version,verification_epoch,is_open,activated_at from public.academy_admission_policies where tribe_id=${command.tribeId} for share`)).rows[0];
  const actorId=(await database.execute<{actor_id:string|null}>(sql`select public.current_app_user_id() as actor_id`)).rows[0]?.actor_id;
  if(!actorId) return {status:"admission_closed"};
  const members=(await database.execute<MemberRow>(sql`select id,user_id,role,status,status_reason,commercial_recovery_status,created_at from public.tribe_members where tribe_id=${command.tribeId} and user_id in (${actorId},${command.userId}) order by user_id for update`)).rows;
  const actor=members.find((member)=>member.user_id===actorId);
  const manages=actor?.status===TRIBE_MEMBERSHIP_STATUS.active&&(actor.role===TRIBE_MEMBER_ROLE.leader||actor.role===TRIBE_MEMBER_ROLE.guardian);
  if(actorId!==command.userId&&!manages) return {status:"admission_closed"};
  const current=members.find((member)=>member.user_id===command.userId);
  const eligibility=evaluateAcademyMembershipEligibility(current?mapMember(current):null);
  if(eligibility.outcome===ACADEMY_MEMBERSHIP_ELIGIBILITY.alreadyMember) return {status:"already_member",member:eligibility.member};
  if(eligibility.outcome===ACADEMY_MEMBERSHIP_ELIGIBILITY.blocked) return {status:"blocked"};
  if(!tribe.admissions_control_activated_at||!policy?.is_open||!policy.activated_at) return {status:"admission_closed"};
  const decision=(await database.execute<{id:string;request_id:string;user_id:string;tribe_id:string;actor_user_id:string|null;actor_kind:string;policy_version:number;verification_epoch:number;membership_effect_id:string|null;request_version:number;version:number;expires_at:string}>(sql`
    select decision.id,decision.request_id,decision.user_id,decision.tribe_id,decision.actor_user_id,decision.actor_kind,decision.policy_version,decision.verification_epoch,decision.membership_effect_id,decision.request_version,request.version,request.expires_at
    from public.academy_admission_decisions decision inner join public.academy_admission_requests request on request.id=decision.request_id and request.tribe_id=decision.tribe_id and request.user_id=decision.user_id
    where decision.id=${command.decisionId} and decision.tribe_id=${command.tribeId} and decision.user_id=${command.userId}
      and decision.outcome=${ACADEMY_MEMBERSHIP_DECISION.approved} and request.status=${ACADEMY_MEMBERSHIP_DECISION.approved} and request.decision_id=decision.id
    for update of request,decision
  `)).rows[0];
  if(!decision?.membership_effect_id||decision.policy_version!==policy.version||decision.verification_epoch!==policy.verification_epoch||decision.version!==decision.request_version+1) return {status:"admission_closed"};
  const manual=decision.actor_kind===ACADEMY_MEMBERSHIP_DECISION.user&&decision.actor_user_id===actorId&&manages&&actorId!==command.userId;
  const automatic=decision.actor_kind===ACADEMY_MEMBERSHIP_DECISION.system&&actorId===command.userId&&decision.actor_user_id===null;
  if(!manual&&!automatic) return {status:"admission_closed"};
  // Read settings after earlier lock waits and hold the mode until this transaction commits.
  const settings=(await database.execute<{access_model:string}>(sql`select access_model from public.tribe_academy_settings where tribe_id=${command.tribeId} for share`)).rows[0];
  if(settings?.access_model!==TRIBE_ACCESS_MODEL.academy) return {status:"admission_closed"};
  const now=(await database.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now;
  if(new Date(decision.expires_at).getTime()<=new Date(now).getTime()) return {status:"admission_closed"};
  const memberId=current?.id??randomUUID();
  await database.execute(sql`insert into public.academy_admission_membership_effects(id,decision_id,request_id,tribe_id,user_id,member_id,target_status) values (${decision.membership_effect_id},${decision.id},${decision.request_id},${command.tribeId},${command.userId},${memberId},${eligibility.status})`);
  if(eligibility.outcome===ACADEMY_MEMBERSHIP_ELIGIBILITY.create) await database.execute(sql`insert into public.tribe_members(id,tribe_id,user_id,role,status,status_reason,joined_via,admission_membership_effect_id) values (${memberId},${command.tribeId},${command.userId},${TRIBE_MEMBER_ROLE.tribemate},${eligibility.status},${TRIBE_MEMBERSHIP_STATUS_REASON.none},${TRIBE_MEMBER_ACADEMY_ADMISSION_SOURCE},${decision.membership_effect_id})`);
  else await database.execute(sql`update public.tribe_members set status=${eligibility.status},status_reason=${TRIBE_MEMBERSHIP_STATUS_REASON.none},admission_membership_effect_id=${decision.membership_effect_id} where id=${memberId}`);
  const applied=(await database.execute<MemberRow>(sql`select id,user_id,role,status,status_reason,commercial_recovery_status,created_at from public.tribe_members where id=${memberId}`)).rows[0];
  return {status:"joined",member:mapMember(applied)};
}

/**
 * Composes the domain port with the same transaction used by admission effects.
 * @param database - Caller-owned guarded transaction; no nested checkout is performed.
 * @returns A transaction-bound port suitable for the admission writer's composition root.
 */
export function createAcademyApprovedMembershipWriter(database:RequestDatabase):AcademyApprovedMembershipWriter {
  return {apply:(command)=>applyApprovedAcademyMembership(database,command)};
}
