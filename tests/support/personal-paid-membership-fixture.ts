/** Seeds legitimate pre-cutover commercial history beside an actual personal admission. @module personal-paid-membership-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAllowlistAdmission } from "./allowlist-admission-database-fixture";
import { SUBSCRIPTION_MEMBERSHIP_FIXTURE } from "./constants/subscription-membership-reconciliation";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** @param database - Exact owned branch. @returns Native personal redemption, historic muted instance and current paid resources; provider credentials remain private and random. */
export async function preparePersonalPaidMembership(database: AcademyAdmissionTestDatabase) {
  const { fixture, historicalApplicant: recipient } = await prepareAllowlistAdmission(database, undefined, "muted");
  if (!recipient) throw new Error("Personal paid fixture failed: historical applicant unavailable");
  for (const migration of ["20261009130000_add_personal_invitation_context_digest.sql", "20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql"]) await database.applyMigration(migration);
  const priceId = randomUUID(), integrationId = randomUUID(), subscriptionId = randomUUID(), providerId = randomUUID(), slug = `allowlist-${fixture.tribeId}`;
  const originalMember = await database.withContext(fixture.own, async (transaction) => {
    const member = (await transaction.execute<{id: string;role: string;created_at: string}>(sql`select id,role,created_at::text from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows[0];
    await transaction.execute(sql`insert into public.tribe_payment_integrations(id,tribe_id,provider,account_label,status,access_token,token_expires_at,connected_by) values (${integrationId},${fixture.tribeId},'mercado_pago','Synthetic personal payment','connected',${randomUUID()},clock_timestamp()+interval '1 day',${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_subscription_prices(id,tribe_id,name,amount_cents,currency,frequency,status,is_current,mercado_pago_preapproval_plan_id,payment_integration_id,product_key,created_by) values (${priceId},${fixture.tribeId},'Synthetic membership price',${SUBSCRIPTION_MEMBERSHIP_FIXTURE.amountCents},'ARS','monthly','active',true,${randomUUID()},${integrationId},'membership',${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_member_subscriptions(id,tribe_id,user_id,price_id,payment_integration_id,mercado_pago_preapproval_id,status,product_key,price_snapshot_amount_cents,price_snapshot_currency,price_snapshot_frequency,terms_accepted_at,updated_at) values (${subscriptionId},${fixture.tribeId},${recipient.userId},${priceId},${integrationId},${providerId},'canceled','membership',${SUBSCRIPTION_MEMBERSHIP_FIXTURE.amountCents},'ARS','monthly',clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`update public.tribe_members set status='removed',status_reason='subscription_inactive' where id=${member.id}`);
    await transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`);
    return member;
  });
  const invitations = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
  const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
  const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Resolución por membresía legítima", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
  if (created.state !== "completed" || !created.initialToken) throw new Error("Personal paid fixture failed: emitted token unavailable");
  const submission = { ...recipient.input, expectedPolicyVersion: 3, invitationToken: created.initialToken };
  const submitted = await recipient.commands.submit.execute(submission);
  if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error(`Personal paid fixture failed: pending unavailable${submitted.ok ? "" : `/${submitted.failure.code}`}`, { cause: submitted.ok ? undefined : submitted.failure.cause });
  return { fixture, recipient, originalMember, priceId, subscriptionId, providerId, slug, invitationId: created.result.invitationId, requestId: submitted.value.result.admissionRequestId, submission };
}
