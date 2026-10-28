/** @vitest-environment node */
/** Exercises paid owners with a real consumed personal invitation and subsequent membership exit. @module personal-admission-paid-resolution-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalPaidMembership } from "@/tests/support/personal-paid-membership-fixture";
import { createSubscriptionMembershipReconciliationRepository } from "@/tests/support/subscription-membership-reconciliation-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { PostgresTribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import { TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE } from "@/src/modules/subscriptions/constants/subscriptions";
import { createPaidAdmissionResolutionWriter, createAdmissionMembershipLifecycleWriter } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresTribeMembershipLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-membership-lifecycle-repository";
import { ManageTribeMembershipUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-membership-use-cases";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal paid admission resolution", () => {
  it.each(["price", "diagnostics", "member"] as const)("should cancel the real pending through %s while preserving consumed identity and commercial muted history", async (entrypoint) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const scenario = await preparePersonalPaidMembership(database), { fixture, recipient } = scenario;
      /** @returns Immutable consumed attribution and binding metadata only. */
      const attribution = () => database.withContext(fixture.own, async (transaction) => ({
        invitation: (await transaction.execute(sql`select status,redeemed_request_id,redeemed_by_user_id,redeemed_at::text from public.academy_personal_invitations where id=${scenario.invitationId}`)).rows[0],
        binding: (await transaction.execute(sql`select id,owner_user_id,first_request_id,first_proof_id,created_at::text from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${recipient.userId}`)).rows[0],
      }));
      const before = await attribution();
      /** @param expectedWebhookStatus - Independent first-delivery or exact replay contract. @returns After the selected real payment owner consumes its current source; only the owned provider-read port returns synthetic status. */
      const reconcile = async (expectedWebhookStatus: "processed" | "duplicate_webhook" = "processed") => {
        const own = { userId: fixture.userId, email: null };
        if (entrypoint === "member") {
          const unexpected = async () => { throw new Error("Personal paid scenario unexpectedly invoked a provider mutation"); };
          const repository = new PostgresTribeMemberSubscriptionRepository({ executeWithDatabase: (run) => database.withContext(own, run), createMercadoPagoPreapprovalSubscription: unexpected, getMercadoPagoPreapprovalDetails: unexpected, getMercadoPagoPreapprovalStatus: async () => "authorized", updateMercadoPagoPreapprovalStatus: unexpected, updateMercadoPagoPreapprovalBackUrl: unexpected, refreshMercadoPagoAccessToken: unexpected, createAdmissionResolution: createPaidAdmissionResolutionWriter, requestId: randomUUID() });
          expect(await repository.handleWebhook({ eventId: randomUUID(), resourceId: scenario.providerId, topic: "subscription_preapproval" })).toMatchObject({ status: expectedWebhookStatus });
        } else {
          const repository = createSubscriptionMembershipReconciliationRepository(database, own, "authorized");
          const result = entrypoint === "price"
            ? await repository.reconcileProviderSubscribers({ priceId: scenario.priceId, tribeSlug: scenario.slug, source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton })
            : await repository.reconcileSubscriberDiagnostics({ tribeSlug: scenario.slug });
          expect(result).toMatchObject({ status: "verified", verifiedCount: 1 });
        }
      };
      await reconcile();
      await reconcile("duplicate_webhook");
      expect(await attribution()).toEqual(before);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,role,status,status_reason,created_at::text from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ ...scenario.originalMember, status: "muted", status_reason: "none" }]);
        expect((await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where id=${scenario.requestId}`)).rows).toEqual([{ status: "cancelled", cancel_reason: "external_resolution" }]);
        expect((await transaction.execute(sql`select outcome,actor_kind,actor_user_id,rule,membership_effect_id from public.academy_admission_decisions where request_id=${scenario.requestId}`)).rows).toEqual([{ outcome: "cancelled", actor_kind: "system", actor_user_id: null, rule: "external_resolution", membership_effect_id: null }]);
        expect((await transaction.execute(sql`select (select count(*)::integer from public.academy_admission_notification_obligations where request_id=${scenario.requestId} and event_type='cancelled') as obligations,(select count(*)::integer from public.notifications where tribe_id=${fixture.tribeId} and recipient_user_id=${recipient.userId} and type='admission_cancelled') as notices,(select count(*)::integer from public.academy_admission_membership_effects where request_id=${scenario.requestId}) as admission_effects,(select count(*)::integer from public.subscription_membership_effects where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}) as paid_effects`)).rows).toEqual([{ obligations: 1, notices: 1, admission_effects: 0, paid_effects: 1 }]);
      });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: recipient.userId, sessionId: recipient.sessionId }), (_identity, run) => database.withContext({ userId: recipient.userId, email: recipient.email }, run));
      const membership = new ManageTribeMembershipUseCases(accounts, new PostgresTribeMembershipLifecycleRepository((_context, run) => database.withContext({ userId: recipient.userId, email: recipient.email }, run), async () => fixture.config, createAdmissionMembershipLifecycleWriter));
      expect(await membership.change({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), memberId: scenario.originalMember.id, action: "leave", expectedStatus: "muted", confirmed: true })).toMatchObject({ state: "completed", result: { outcome: "changed", deleted: true } });
      expect(await recipient.commands.submit.execute({ ...scenario.submission, operationId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await recipient.commands.submit.execute(scenario.submission)).toMatchObject({ ok: true, value: { state: "completed", replayed: true } });
      expect(await attribution()).toEqual(before);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as total from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select applied_at is not null as consumed,revoked_at is not null as revoked,member_id from public.subscription_membership_effects where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ consumed: true, revoked: true, member_id: null }]);
        expect((await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where id=${scenario.requestId}`)).rows).toEqual([{ status: "cancelled", cancel_reason: "external_resolution" }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
