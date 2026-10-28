/** @vitest-environment node */
/** Exercises actual pending cancellation before approval and all paid entrypoints after moderation. @module academy-restricted-pending-membership-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildAcademyAdmissionsModule, createAdmissionMembershipLifecycleWriter, createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresTribeMembershipLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-membership-lifecycle-repository";
import { ManageTribeMembershipUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-membership-use-cases";
import { PostgresTribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import { TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE } from "@/src/modules/subscriptions/constants/subscriptions";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalPaidMembership } from "@/tests/support/personal-paid-membership-fixture";
import { createSubscriptionMembershipReconciliationRepository } from "@/tests/support/subscription-membership-reconciliation-fixture";
import { SUBSCRIPTION_MEMBERSHIP_FIXTURE } from "@/tests/support/constants/subscription-membership-reconciliation";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native moderation of pending membership", () => {
  it.each(["remove", "block"] as const)("should deny actual approval and paid recovery when the owner applies %s to a real pending applicant", async (action) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: the account holds actual commercial history and a real personal pending.
      const scenario = await preparePersonalPaidMembership(database);
      const { fixture, recipient } = scenario;
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admission = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
      /** Reads only native state, decisions and personal attribution. @returns Persisted outcome without secrets. */
      const snapshot = () => database.withContext(fixture.own, async (transaction) => ({
        member: (await transaction.execute(sql`select id,role,status,status_reason,created_at::text from public.tribe_members where id=${scenario.originalMember.id}`)).rows[0],
        request: (await transaction.execute(sql`select status,version,cancel_reason,submitted_at::text,expires_at::text from public.academy_admission_requests where id=${scenario.requestId}`)).rows[0],
        decisions: (await transaction.execute(sql`select id,outcome,actor_kind,rule,membership_effect_id,decided_at::text from public.academy_admission_decisions where request_id=${scenario.requestId} order by id`)).rows,
        basic: (await transaction.execute(sql`select id from public.academy_admission_membership_effects where request_id=${scenario.requestId}`)).rows,
        paid: (await transaction.execute(sql`select id from public.subscription_membership_effects where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows,
        notices: (await transaction.execute(sql`select id,event_type from public.academy_admission_notification_obligations where request_id=${scenario.requestId} order by id`)).rows,
        invitation: (await transaction.execute(sql`select status,redeemed_request_id,redeemed_by_user_id,redeemed_at::text from public.academy_personal_invitations where id=${scenario.invitationId}`)).rows[0],
        binding: (await transaction.execute(sql`select id,owner_user_id,first_request_id,created_at::text from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${recipient.userId}`)).rows,
      }));
      const before = await snapshot();
      expect(before.request).toMatchObject({ status: "pending", version: 2 });
      expect(before.member).toMatchObject({ ...scenario.originalMember, status: "removed", status_reason: "subscription_inactive" });
      expect(before.decisions).toEqual([]);

      // Act: the real membership owner imposes the restriction and closes the pending once.
      const moderation = new ManageTribeMembershipUseCases(accounts, new PostgresTribeMembershipLifecycleRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createAdmissionMembershipLifecycleWriter));
      const command = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), memberId: scenario.originalMember.id, action, expectedStatus: "removed" as const, confirmed: true };
      expect(await moderation.change(command)).toMatchObject({ state: "completed", result: { outcome: "changed" } });
      expect(await moderation.change(command)).toMatchObject({ state: "completed", replayed: true });
      const closed = await snapshot();
      expect(closed.member).toMatchObject({ ...scenario.originalMember, status: action === "remove" ? "removed" : "blocked", status_reason: action === "remove" ? "none" : "conduct_blocked" });
      expect(closed.request).toEqual({ ...before.request, status: "cancelled", version: 3, cancel_reason: "nonrecoverable_membership" });
      expect(closed.decisions).toMatchObject([{ outcome: "cancelled", actor_kind: "system", rule: "nonrecoverable_membership", membership_effect_id: null }]);
      expect(closed.decisions).toHaveLength(1);
      expect(closed.basic).toEqual([]);
      expect(closed.paid).toEqual([]);
      expect(closed.notices.filter((notice) => notice.event_type === "cancelled")).toHaveLength(1);
      expect(closed.invitation).toEqual(before.invitation);
      expect(closed.binding).toEqual(before.binding);

      // Assert: a valid leader cannot approve this real request after moderation.
      expect(await admission.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: scenario.requestId, expectedVersion: 3, confirmed: true, decision: "approve", internalReason: "Revisión posterior a moderación", externalMessage: null })).toMatchObject({ ok: false, failure: { code: "request_conflict" } });
      expect(await snapshot()).toEqual(closed);
      const paid = createSubscriptionMembershipReconciliationRepository(database, { userId: fixture.userId, email: null }, "authorized");
      expect(await paid.reconcileProviderSubscribers({ priceId: scenario.priceId, tribeSlug: scenario.slug, source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton })).toMatchObject({ status: "verified", verifiedCount: 1 });
      expect(await snapshot()).toEqual(closed);
      expect(await paid.reconcileSubscriberDiagnostics({ tribeSlug: scenario.slug })).toMatchObject({ status: "verified", verifiedCount: 1 });
      expect(await snapshot()).toEqual(closed);
      const unexpected = async () => { throw new Error("AcademyRestrictedPendingMembershipTest: provider mutation unexpectedly invoked"); };
      const webhook = new PostgresTribeMemberSubscriptionRepository({ executeWithDatabase: (run) => database.withContext({ userId: fixture.userId, email: null }, run), createMercadoPagoPreapprovalSubscription: unexpected, getMercadoPagoPreapprovalDetails: unexpected, getMercadoPagoPreapprovalStatus: async () => "authorized", updateMercadoPagoPreapprovalStatus: unexpected, updateMercadoPagoPreapprovalBackUrl: unexpected, refreshMercadoPagoAccessToken: unexpected, createAdmissionResolution: createPaidAdmissionResolutionWriter, requestId: randomUUID() });
      expect(await webhook.handleWebhook({ eventId: randomUUID(), resourceId: scenario.providerId, topic: SUBSCRIPTION_MEMBERSHIP_FIXTURE.providerWebhookTopic })).toMatchObject({ status: "processed" });
      expect(await snapshot()).toEqual(closed);
      expect(await recipient.commands.submit.execute({ ...scenario.submission, operationId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await snapshot()).toEqual(closed);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
