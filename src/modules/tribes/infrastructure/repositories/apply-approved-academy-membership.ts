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
import {readApprovedAcademyMembershipContext,type ApprovedAcademyMembershipMemberRow} from "./read-approved-academy-membership-context";

/** Fields consumed from owned storage; no backend schema revalidation is performed. */
type MemberRow=ApprovedAcademyMembershipMemberRow;

/** Maps the consumed persisted fields into the owner's internal facts. */
function mapMember(row:MemberRow):AcademyMembershipFacts {
  return {id:row.id,role:row.role,status:row.status,statusReason:row.status_reason,commercialRecoveryStatus:row.commercial_recovery_status,createdAt:new Date(row.created_at)};
}

type ApprovedMembershipContext=NonNullable<Awaited<ReturnType<typeof readApprovedAcademyMembershipContext>>>;
type ApplicableDecision=NonNullable<ApprovedMembershipContext["decision"]>&{membership_effect_id:string};

/**
 * Checks the open policy, the exact decision version, its actor, the academy model and the expiry.
 * @param context - Locked membership facts with the post-wait database clock.
 * @param input - Current actor, whether it manages the tribe, and the beneficiary.
 * @returns The decision when this actor may still consume it for the beneficiary, otherwise null.
 */
function findApplicableDecision(context:ApprovedMembershipContext,input:{actorId:string;manages:boolean;userId:string}):ApplicableDecision|null {
  const {policy,decision}=context;
  if(!context.admissions_control_activated_at||!policy?.is_open||!policy.activated_at) return null;
  if(!decision?.membership_effect_id||decision.policy_version!==policy.version||decision.verification_epoch!==policy.verification_epoch||decision.version!==decision.request_version+1) return null;
  const manual=decision.actor_kind===ACADEMY_MEMBERSHIP_DECISION.user&&decision.actor_user_id===input.actorId&&input.manages&&input.actorId!==input.userId;
  const automatic=decision.actor_kind===ACADEMY_MEMBERSHIP_DECISION.system&&input.actorId===input.userId&&decision.actor_user_id===null;
  if(!manual&&!automatic) return null;
  if(context.access_model!==TRIBE_ACCESS_MODEL.academy) return null;
  if(new Date(decision.expires_at).getTime()<=new Date(context.now).getTime()) return null;
  return {...decision,membership_effect_id:decision.membership_effect_id};
}

/**
 * Applies a scoped approved decision without starting another transaction or any RPC.
 * @param database - The authoritative admission writer's guarded transaction.
 * @param command - Internal account/tribe/decision identity, never a permission flag.
 * @returns Existing readable state or the basic member; invalid scope stays closed.
 * @remarks The caller commits request, decision, contact effects, audit and notice together.
 */
export async function applyApprovedAcademyMembership(database:RequestDatabase,command:ApplyApprovedAcademyMembershipCommand):Promise<ApplyApprovedAcademyMembershipResult> {
  const context=await readApprovedAcademyMembershipContext(database,command);
  if(!context) return {status:"admission_closed"};
  const {members}=context;
  const actorId=context.actor_id;
  if(!actorId) return {status:"admission_closed"};
  const actor=members.find((member)=>member.user_id===actorId);
  const manages=actor?.status===TRIBE_MEMBERSHIP_STATUS.active&&(actor.role===TRIBE_MEMBER_ROLE.leader||actor.role===TRIBE_MEMBER_ROLE.guardian);
  if(actorId!==command.userId&&!manages) return {status:"admission_closed"};
  const current=members.find((member)=>member.user_id===command.userId);
  const eligibility=evaluateAcademyMembershipEligibility(current?mapMember(current):null);
  if(eligibility.outcome===ACADEMY_MEMBERSHIP_ELIGIBILITY.alreadyMember) return {status:"already_member",member:eligibility.member};
  if(eligibility.outcome===ACADEMY_MEMBERSHIP_ELIGIBILITY.blocked) return {status:"blocked"};
  const decision=findApplicableDecision(context,{actorId,manages,userId:command.userId});
  if(!decision) return {status:"admission_closed"};
  const memberId=current?.id??randomUUID();
  await database.execute(sql`insert into public.academy_admission_membership_effects(id,decision_id,request_id,tribe_id,user_id,member_id,target_status) values (${decision.membership_effect_id},${decision.id},${decision.request_id},${command.tribeId},${command.userId},${memberId},${eligibility.status})`);
  const applied=eligibility.outcome===ACADEMY_MEMBERSHIP_ELIGIBILITY.create
    ? (await database.execute<MemberRow>(sql`insert into public.tribe_members(id,tribe_id,user_id,role,status,status_reason,joined_via,admission_membership_effect_id) values (${memberId},${command.tribeId},${command.userId},${TRIBE_MEMBER_ROLE.tribemate},${eligibility.status},${TRIBE_MEMBERSHIP_STATUS_REASON.none},${TRIBE_MEMBER_ACADEMY_ADMISSION_SOURCE},${decision.membership_effect_id}) returning id,user_id,role,status,status_reason,commercial_recovery_status,created_at`)).rows[0]
    : (await database.execute<MemberRow>(sql`update public.tribe_members set status=${eligibility.status},status_reason=${TRIBE_MEMBERSHIP_STATUS_REASON.none},admission_membership_effect_id=${decision.membership_effect_id} where id=${memberId} returning id,user_id,role,status,status_reason,commercial_recovery_status,created_at`)).rows[0];
  if(!applied) throw new Error("AcademyMembershipWriter.apply failed: persisted_member_missing");
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
