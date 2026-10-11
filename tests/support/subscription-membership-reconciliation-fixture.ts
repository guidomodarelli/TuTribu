/** Prepares owned native payment actors without making provider mutations. @module subscription-membership-reconciliation-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";
import type { PaidAdmissionResolutionFactory } from "@/src/modules/subscriptions/infrastructure/repositories/subscription-membership-source-writer";
import { PostgresTribeSubscriptionPriceRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-subscription-price-repository";
import { MERCADO_PAGO_CONNECTION_STATUS, TRIBE_MEMBER_SUBSCRIPTION_STATUS, TRIBE_SUBSCRIPTION_CURRENCY, TRIBE_SUBSCRIPTION_FREQUENCY, TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS, TRIBE_MEMBERSHIP_STATUS_REASON } from "@/src/modules/tribes/constants/tribe-page-access";
import type { AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { SUBSCRIPTION_MEMBERSHIP_FIXTURE, SUBSCRIPTION_MEMBERSHIP_MIGRATIONS, type SubscriptionReconciliationProduct } from "./constants/subscription-membership-reconciliation";

/**
 * Seeds the existing reconciliation contract in an owned native branch.
 * @param database - Isolated PostgreSQL branch and actual request context.
 * @param product - Real commercial product whose subscription is reconciled.
 * @param state - Stored membership state before the payment operation.
 * @param reason - Stored restriction reason; no recovery history is invented.
 * @returns Synthetic native actor and resource identities, without credentials.
 */
export async function seedSubscriptionMembershipReconciliation(database: AcademyAdmissionTestDatabase, product: SubscriptionReconciliationProduct, state: "active" | "muted" | "blocked" | "removed", reason: string = TRIBE_MEMBERSHIP_STATUS_REASON.none) {
  for (const migration of SUBSCRIPTION_MEMBERSHIP_MIGRATIONS) await database.applyMigration(migration);
  const leaderId = randomUUID(), userId = randomUUID(), tribeId = randomUUID(), priceId = randomUUID(), integrationId = randomUUID(), subscriptionId = randomUUID(), providerId = randomUUID(), slug = `reconciliation-${tribeId}`;
  const own = { userId: leaderId, email: null };
  await database.withContext(own, async (transaction) => {
    for (const accountId of [leaderId, userId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${accountId},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.accountName},${`${accountId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.tribeName},${slug},${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,status_reason) values (${tribeId},${leaderId},${TRIBE_MEMBER_ROLE.leader},${TRIBE_MEMBERSHIP_STATUS.active},${TRIBE_MEMBERSHIP_STATUS_REASON.none}),(${tribeId},${userId},${TRIBE_MEMBER_ROLE.tribemate},${state},${reason})`);
    await transaction.execute(sql`insert into public.tribe_payment_integrations(id,tribe_id,provider,account_label,status,access_token,token_expires_at,connected_by) values (${integrationId},${tribeId},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.provider},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.integrationLabel},${MERCADO_PAGO_CONNECTION_STATUS.connected},${randomUUID()},clock_timestamp()+interval '1 day',${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_subscription_prices(id,tribe_id,name,amount_cents,currency,frequency,status,is_current,mercado_pago_preapproval_plan_id,payment_integration_id,product_key,created_by) values (${priceId},${tribeId},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.priceName},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.amountCents},${TRIBE_SUBSCRIPTION_CURRENCY.ars},${TRIBE_SUBSCRIPTION_FREQUENCY.monthly},${TRIBE_SUBSCRIPTION_PRICE_STATUS.active},true,${randomUUID()},${integrationId},${product},${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_member_subscriptions(id,tribe_id,user_id,price_id,payment_integration_id,mercado_pago_preapproval_id,status,product_key,price_snapshot_amount_cents,price_snapshot_currency,price_snapshot_frequency,terms_accepted_at,updated_at) values (${subscriptionId},${tribeId},${userId},${priceId},${integrationId},${providerId},${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active},${product},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.amountCents},${TRIBE_SUBSCRIPTION_CURRENCY.ars},${TRIBE_SUBSCRIPTION_FREQUENCY.monthly},clock_timestamp(),clock_timestamp()-interval '1 hour')`);
  });
  return { own, userId, tribeId, priceId, providerId, subscriptionId, slug };
}

/**
 * Constructs the actual price repository with only its provider-read port controlled.
 * @param database - Owned native branch.
 * @param own - Real fixture actor used by the guarded executor.
 * @param providerStatus - Controlled external state returned by the owned provider port.
 * @param createAdmissionResolution - Actual admission collaborator unless a rollback case supplies its own port.
 * @returns Production repository whose provider mutation ports fail visibly if invoked.
 */
export function createSubscriptionMembershipReconciliationRepository(database: AcademyAdmissionTestDatabase, own: { userId: string; email: null }, providerStatus: "authorized" | "cancelled", createAdmissionResolution: PaidAdmissionResolutionFactory = createPaidAdmissionResolutionWriter) {
  const unexpected = async () => { throw new Error("SubscriptionMembershipReconciliationFixture: provider mutation unexpectedly invoked"); };
  return new PostgresTribeSubscriptionPriceRepository((callback) => database.withContext(own, callback), unexpected, unexpected, unexpected, unexpected, unexpected, async () => providerStatus, createAdmissionResolution, randomUUID());
}
