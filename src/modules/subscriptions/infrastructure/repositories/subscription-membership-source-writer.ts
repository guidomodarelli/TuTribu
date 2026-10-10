/** Consumes current paid membership provenance after provider states are visible in a new SQL statement. @module subscription-membership-source-writer */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { TRIBE_SUBSCRIPTION_PRODUCT_KEY, TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { TRIBE_MEMBERSHIP_STATUS, TRIBE_MEMBERSHIP_STATUS_REASON } from "@/src/modules/tribes/constants/tribe-page-access";
import { ACADEMY_MEMBERSHIP_ELIGIBILITY } from "@/src/modules/tribes/constants/academy-membership";
import { evaluateAcademyMembershipEligibility, type AcademyMembershipStateFacts } from "@/src/modules/tribes/domain/value-objects/academy-membership-eligibility";
import type { AdmissionExternalResolutionWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-external-resolution-writer";

/** Composes the admission owner onto this same guarded payment transaction. */
export type PaidAdmissionResolutionFactory = (database: RequestDatabase) => AdmissionExternalResolutionWriter;

/** Own stored provider identities limit the effect to subscriptions actually reconciled by the caller. */
export type SubscriptionMembershipSourceScope = { providerSubscriptionIds: readonly string[]; tribeSlug?: string; priceId?: string };
/** Consumed private columns; timestamps remain text to preserve PostgreSQL microsecond identity. */
type PaidCandidate = {
  id: string; tribe_id: string; user_id: string; role: AcademyMembershipStateFacts["role"]; status: AcademyMembershipStateFacts["status"];
  status_reason: string; commercial_recovery_status: AcademyMembershipStateFacts["commercialRecoveryStatus"];
  subscription_id: string; provider_subscription_ref: string; source_updated_at: string;
};

/**
 * Recovers only a known commercial basic instance from current stored membership payments, never a client flag.
 * The caller has already persisted provider status in this transaction and must call this in a separate statement.
 * @param database - Existing guarded owner transaction; no nested checkout or provider call occurs.
 * @param scope - Exact stored references read/verified by the payment owner, with its optional tenant/price scope.
 * @param createAdmissionResolution - Mandatory admission owner collaborator; no missing-hook fallback is permitted.
 * @returns Number of recovered instances; readable, privileged, moderated and unknown histories stay untouched.
 */
export async function recoverProtectedSubscriptionMemberships(database: RequestDatabase, scope: SubscriptionMembershipSourceScope, createAdmissionResolution: PaidAdmissionResolutionFactory): Promise<number> {
  if (!scope.providerSubscriptionIds.length) return 0;
  const providerIds = sql`${sql.param([...scope.providerSubscriptionIds])}::text[]`;
  const scopePredicate = sql`affected.mercado_pago_preapproval_id=any(${providerIds})
    and (${scope.tribeSlug ?? null}::text is null or tribe.slug=${scope.tribeSlug ?? null})
    and (${scope.priceId ?? null}::uuid is null or affected.price_id=${scope.priceId ?? null}::uuid)`;
  await database.execute(sql`select tribe.id from public.tribes tribe where tribe.admissions_control_activated_at is not null and exists(select 1 from public.tribe_member_subscriptions affected where affected.tribe_id=tribe.id and ${scopePredicate}) order by tribe.id for update`);
  // Hold the actual managerial row while the source and its membership are committed.
  await database.execute(sql`select actor.id from public.tribe_members actor join public.tribes tribe on tribe.id=actor.tribe_id where actor.user_id=public.current_app_user_id() and tribe.admissions_control_activated_at is not null and exists(select 1 from public.tribe_member_subscriptions affected where affected.tribe_id=tribe.id and ${scopePredicate}) order by actor.id for share of actor`);
  const candidates = (await database.execute<PaidCandidate>(sql`
    select member.id,member.tribe_id,member.user_id,member.role,member.status,member.status_reason,member.commercial_recovery_status,
      current_payment.id as subscription_id,current_payment.mercado_pago_preapproval_id as provider_subscription_ref,current_payment.updated_at::text as source_updated_at
    from public.tribe_members member join public.tribes tribe on tribe.id=member.tribe_id
    join lateral (
      select subscription.id,subscription.mercado_pago_preapproval_id,subscription.updated_at
      from public.tribe_member_subscriptions subscription join public.tribe_subscription_prices price on price.id=subscription.price_id and price.tribe_id=subscription.tribe_id
      where subscription.tribe_id=member.tribe_id and subscription.user_id=member.user_id and subscription.product_key=${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
        and subscription.status=${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active} and subscription.mercado_pago_preapproval_id is not null and price.product_key=${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership}
      order by subscription.updated_at desc,subscription.id limit 1
    ) current_payment on true
    where tribe.admissions_control_activated_at is not null and member.status not in (${TRIBE_MEMBERSHIP_STATUS.active},${TRIBE_MEMBERSHIP_STATUS.muted})
      and (public.can_manage_tribe_subscription_prices(tribe.id) or public.current_app_user_id()=member.user_id or public.is_mercado_pago_webhook_verified())
      and exists(select 1 from public.tribe_member_subscriptions affected where affected.tribe_id=member.tribe_id and affected.user_id=member.user_id and affected.product_key=${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership} and ${scopePredicate})
    order by member.id for update of member
  `)).rows;
  let recovered = 0;
  for (const candidate of candidates) {
    const proposal = evaluateAcademyMembershipEligibility({ role: candidate.role, status: candidate.status, statusReason: candidate.status_reason, commercialRecoveryStatus: candidate.commercial_recovery_status });
    if (proposal.outcome !== ACADEMY_MEMBERSHIP_ELIGIBILITY.recover) continue;
    const effectId = randomUUID();
    await database.execute(sql`insert into public.subscription_membership_effects(id,subscription_id,tribe_id,user_id,member_id,provider_subscription_ref,source_updated_at,target_status) values (${effectId},${candidate.subscription_id},${candidate.tribe_id},${candidate.user_id},${candidate.id},${candidate.provider_subscription_ref},${candidate.source_updated_at}::timestamptz,${proposal.status})`);
    await database.execute(sql`update public.tribe_members set status=${proposal.status},status_reason=${TRIBE_MEMBERSHIP_STATUS_REASON.none},subscription_membership_effect_id=${effectId} where id=${candidate.id} and tribe_id=${candidate.tribe_id} and user_id=${candidate.user_id}`);
    await createAdmissionResolution(database).resolvePaidMembership({ membershipEffectId: effectId, tribeId: candidate.tribe_id, userId: candidate.user_id });
    recovered += 1;
  }
  return recovered;
}
