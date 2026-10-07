/** Builds one persisted membership calculation from current subscription facts. */
import {sql} from "drizzle-orm";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {TRIBE_MEMBERSHIP_STATUS,TRIBE_MEMBERSHIP_STATUS_REASON} from "@/src/modules/tribes/constants/tribe-page-access";
import {TRIBE_MEMBER_SUBSCRIPTION_STATUS,TRIBE_SUBSCRIPTION_PRODUCT_KEY} from "@/src/modules/subscriptions/constants/subscriptions";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Identifies stored tenant scope without accepting a permission flag. */
type SubscriptionMembershipLockScope={tribeSlug:string}|{tribeId:string}|{providerSubscriptionId:string}|{subscriptionId:string};

/**
 * Serializes membership writers before changing a subscription or member row.
 * @param database - Existing guarded transaction; no new pool or RPC is created.
 * @param scope - Own stored resource identity resolved by the repository.
 * @returns Nothing after the ordered tribe locks; the next statement gets a fresh snapshot.
 */
export async function lockSubscriptionMembershipTribes(database:RequestDatabase,scope:SubscriptionMembershipLockScope):Promise<void> {
  const predicate="tribeSlug" in scope?sql`tribes.slug=${scope.tribeSlug}`:
    "tribeId" in scope?sql`tribes.id=${scope.tribeId}`:
    "subscriptionId" in scope?sql`tribes.id in(select tribe_id from public.tribe_member_subscriptions where id=${scope.subscriptionId})`:
    sql`tribes.id in(select tribe_id from public.tribe_member_subscriptions where mercado_pago_preapproval_id=${scope.providerSubscriptionId})`;
  await database.execute(sql`select tribes.id from public.tribes where ${predicate} order by tribes.id for update`);
}

/**
 * Overlays the RETURNING rows onto the statement snapshot before calculating access.
 * @returns A CTE whose caller already supplies updated_subscriptions and affected_members.
 * @remarks Data-modifying CTE siblings cannot reread each other's updated base rows.
 */
export function buildReconciledSubscriptionsSql() {
  return sql`reconciled_subscriptions as (
    select stored.id,stored.tribe_id,stored.user_id,stored.price_id,stored.status,stored.product_key
    from public.tribe_member_subscriptions stored
    where stored.tribe_id in(select id from target_tribe) and not exists(select 1 from updated_subscriptions changed where changed.id=stored.id)
    union all select changed.id,changed.tribe_id,changed.user_id,changed.price_id,changed.status,changed.product_key from updated_subscriptions changed
  )`;
}

/**
 * Updates only basic membership rows affected by the membership product.
 * @returns An UPDATE fragment scoped by the caller's affected_members CTE.
 * @remarks Role, identity and joining date stay with tribes; moderation stays closed.
 */
export function buildSubscriptionMembershipUpdateSql() {
  const hasActive=sql`exists(select 1 from reconciled_subscriptions subscription where subscription.tribe_id=tribe_members.tribe_id and subscription.user_id=tribe_members.user_id and subscription.product_key=${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership} and subscription.status=${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active})`;
  const hasPending=sql`exists(select 1 from reconciled_subscriptions subscription where subscription.tribe_id=tribe_members.tribe_id and subscription.user_id=tribe_members.user_id and subscription.product_key=${TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership} and subscription.status=${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending})`;
  return sql`update public.tribe_members set
    status=case when ${hasActive} then case when tribe_members.status in (${TRIBE_MEMBERSHIP_STATUS.active},${TRIBE_MEMBERSHIP_STATUS.muted}) then tribe_members.status else coalesce(tribe_members.commercial_recovery_status,${TRIBE_MEMBERSHIP_STATUS.active}) end
      when ${hasPending} then ${TRIBE_MEMBERSHIP_STATUS.blocked} else ${TRIBE_MEMBERSHIP_STATUS.removed} end,
    status_reason=case when ${hasActive} then ${TRIBE_MEMBERSHIP_STATUS_REASON.none} when ${hasPending} then ${TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked} else ${TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive} end
    from affected_members where tribe_members.tribe_id=affected_members.tribe_id and tribe_members.user_id=affected_members.user_id
      and tribe_members.role=${TRIBE_MEMBER_ROLE.tribemate}
      and (not exists(select 1 from public.tribes protected_tribe where protected_tribe.id=tribe_members.tribe_id and protected_tribe.admissions_control_activated_at is not null)
        or tribe_members.status in (${TRIBE_MEMBERSHIP_STATUS.active},${TRIBE_MEMBERSHIP_STATUS.muted}) or not ${hasActive})
      and (tribe_members.status in (${TRIBE_MEMBERSHIP_STATUS.active},${TRIBE_MEMBERSHIP_STATUS.muted})
        or (tribe_members.status=${TRIBE_MEMBERSHIP_STATUS.blocked} and tribe_members.status_reason=${TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked})
        or (tribe_members.status=${TRIBE_MEMBERSHIP_STATUS.removed} and tribe_members.status_reason=${TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive}))
      and not exists(select 1 from public.academy_admission_membership_effects basis where basis.id=tribe_members.admission_membership_effect_id and basis.tribe_id=tribe_members.tribe_id and basis.user_id=tribe_members.user_id and basis.member_id=tribe_members.id and basis.applied_at is not null and basis.revoked_at is null)`;
}
