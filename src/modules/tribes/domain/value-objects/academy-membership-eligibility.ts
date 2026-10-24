/** Evaluates basic membership without changing commercial grants, roles or persisted facts. */
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {TRIBE_MEMBERSHIP_STATUS,TRIBE_MEMBERSHIP_STATUS_REASON} from "@/src/modules/tribes/constants/tribe-page-access";
import {ACADEMY_MEMBERSHIP_ELIGIBILITY} from "@/src/modules/tribes/constants/academy-membership";

/** Own observed state; a nullable recovery value means history is unknown. */
export type AcademyMembershipStateFacts={role:"leader"|"guardian"|"tribemate";status:"active"|"muted"|"blocked"|"removed";statusReason:string;commercialRecoveryStatus:"active"|"muted"|null};
/** Full persisted instance identity and joining date used by the tribe writer. */
export type AcademyMembershipFacts=AcademyMembershipStateFacts&{id:string;createdAt:Date};
export type AcademyMembershipEligibility<Member extends AcademyMembershipStateFacts>=
  |{outcome:"create";role:"tribemate";status:"active"}
  |{outcome:"already_member";member:Member}
  |{outcome:"recover";member:Member;role:"tribemate";status:"active"|"muted"}
  |{outcome:"blocked"};

/**
 * Resolves readable membership before proposing new or recovered basic access.
 * @param member - Current owner facts after authorization and locks, or no row.
 * @returns A pure proposal; an unknown or noncommercial restriction remains closed.
 */
export function evaluateAcademyMembershipEligibility<Member extends AcademyMembershipStateFacts>(member:Member|null):AcademyMembershipEligibility<Member> {
  if(!member) return {outcome:ACADEMY_MEMBERSHIP_ELIGIBILITY.create,role:TRIBE_MEMBER_ROLE.tribemate,status:TRIBE_MEMBERSHIP_STATUS.active};
  if(member.status===TRIBE_MEMBERSHIP_STATUS.active||member.status===TRIBE_MEMBERSHIP_STATUS.muted) return {outcome:ACADEMY_MEMBERSHIP_ELIGIBILITY.alreadyMember,member};
  const commercial=(member.status===TRIBE_MEMBERSHIP_STATUS.blocked&&member.statusReason===TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked)||(member.status===TRIBE_MEMBERSHIP_STATUS.removed&&member.statusReason===TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive);
  if(member.role!==TRIBE_MEMBER_ROLE.tribemate||!commercial||member.commercialRecoveryStatus===null) return {outcome:ACADEMY_MEMBERSHIP_ELIGIBILITY.blocked};
  return {outcome:ACADEMY_MEMBERSHIP_ELIGIBILITY.recover,member,role:TRIBE_MEMBER_ROLE.tribemate,status:member.commercialRecoveryStatus};
}
