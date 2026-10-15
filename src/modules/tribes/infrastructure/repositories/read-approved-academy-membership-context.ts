/** Reads the membership owner's current locked facts with one PostgreSQL round trip. @module read-approved-academy-membership-context */
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { ApplyApprovedAcademyMembershipCommand } from "../../domain/repositories/academy-approved-membership-writer";
import type { AcademyMembershipFacts } from "../../domain/value-objects/academy-membership-eligibility";
import { ACADEMY_MEMBERSHIP_DECISION } from "../../constants/academy-membership";
import { TRIBE_MEMBER_ROLE } from "../../constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "../../constants/tribe-page-access";

/** Fields already owned by membership storage, without provider or public DTO validation. */
export type ApprovedAcademyMembershipMemberRow = { id: string; user_id: string; role: AcademyMembershipFacts["role"]; status: AcademyMembershipFacts["status"]; status_reason: string; commercial_recovery_status: "active" | "muted" | null; created_at: string };
/** The exact approved decision and request version consumed by the existing membership owner. */
type ApprovedDecisionRow = { id: string; request_id: string; user_id: string; tribe_id: string; actor_user_id: string | null; actor_kind: string; policy_version: number; verification_epoch: number; membership_effect_id: string | null; request_version: number; version: number; expires_at: string };
/** Own locked storage facts preserve the original domain decisions and post-wait database clock. */
type ApprovedMembershipContext = {
  id: string; admissions_control_activated_at: string | null;
  policy: { version: number; verification_epoch: number; is_open: boolean; activated_at: string | null } | null;
  actor_id: string | null; members: ApprovedAcademyMembershipMemberRow[]; decision: ApprovedDecisionRow | null;
  access_model: string | null; now: string;
};

/**
 * Preserves tribe → policy → sorted members → request/decision → settings lock order.
 * @param database - Existing authoritative admission transaction, never another checkout.
 * @param command - Own scoped decision and beneficiary identities.
 * @returns Current facts or genuine tribe absence; the clock is evaluated after every lock dependency.
 */
export async function readApprovedAcademyMembershipContext(database: RequestDatabase, command: ApplyApprovedAcademyMembershipCommand): Promise<ApprovedMembershipContext | null> {
  const result = await database.execute<ApprovedMembershipContext>(sql`
    with locked_tribe as materialized (
      select tribe.id,tribe.admissions_control_activated_at from public.tribes tribe where tribe.id=${command.tribeId} for update
    ), locked_policy as materialized (
      select policy.version,policy.verification_epoch,policy.is_open,policy.activated_at
      from public.academy_admission_policies policy inner join locked_tribe tribe on tribe.id=policy.tribe_id for share of policy
    ), actor_identity as materialized (
      select public.current_app_user_id() as actor_id from locked_tribe
    ), locked_members as materialized (
      select member.id,member.user_id,member.role,member.status,member.status_reason,member.commercial_recovery_status,member.created_at
      from public.tribe_members member cross join actor_identity actor
      cross join (select count(*) as locked_count from locked_policy) policy_fence
      where policy_fence.locked_count>=0 and actor.actor_id is not null and member.tribe_id=${command.tribeId} and member.user_id in (actor.actor_id,${command.userId})
      order by member.user_id for update of member
    ), locked_decision as materialized (
      select decision.id,decision.request_id,decision.user_id,decision.tribe_id,decision.actor_user_id,decision.actor_kind,
        decision.policy_version,decision.verification_epoch,decision.membership_effect_id,decision.request_version,request.version,request.expires_at
      from public.academy_admission_decisions decision
      inner join public.academy_admission_requests request on request.id=decision.request_id and request.tribe_id=decision.tribe_id and request.user_id=decision.user_id
      cross join actor_identity actor cross join (select count(*) as locked_count from locked_members) member_fence
      where member_fence.locked_count>=0 and decision.id=${command.decisionId} and decision.tribe_id=${command.tribeId} and decision.user_id=${command.userId}
        and decision.outcome=${ACADEMY_MEMBERSHIP_DECISION.approved} and request.status=${ACADEMY_MEMBERSHIP_DECISION.approved} and request.decision_id=decision.id
        and (actor.actor_id=${command.userId} or exists(select 1 from locked_members reviewer where reviewer.user_id=actor.actor_id and reviewer.status=${TRIBE_MEMBERSHIP_STATUS.active} and reviewer.role in (${TRIBE_MEMBER_ROLE.leader},${TRIBE_MEMBER_ROLE.guardian})))
      for update of request,decision
    ), locked_settings as materialized (
      select settings.access_model from public.tribe_academy_settings settings
      cross join (select count(*) as locked_count from locked_decision) decision_fence
      where decision_fence.locked_count>=0 and settings.tribe_id=${command.tribeId} for share of settings
    ), locked_clock as materialized (
      select clock_timestamp() as now from (select count(*) as locked_count from locked_settings) settings_fence where settings_fence.locked_count>=0
    )
    select tribe.id,tribe.admissions_control_activated_at,
      (select to_jsonb(policy) from locked_policy policy) as policy,actor.actor_id,
      coalesce((select jsonb_agg(to_jsonb(member)) from locked_members member),'[]'::jsonb) as members,
      (select to_jsonb(decision) from locked_decision decision) as decision,
      (select settings.access_model from locked_settings settings) as access_model,clock.now
    from locked_tribe tribe cross join actor_identity actor cross join locked_clock clock
  `);
  return result.rows[0] ?? null;
}
