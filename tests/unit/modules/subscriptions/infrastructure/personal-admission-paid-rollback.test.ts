/** @vitest-environment node */
/** Exercises rollback after actual paid recovery and real personal pending closure. @module personal-admission-paid-rollback-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalPaidMembership } from "@/tests/support/personal-paid-membership-fixture";
import { createSubscriptionMembershipReconciliationRepository } from "@/tests/support/subscription-membership-reconciliation-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";
import { TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE } from "@/src/modules/subscriptions/constants/subscriptions";
import type { PaidAdmissionResolutionFactory } from "@/src/modules/subscriptions/infrastructure/repositories/subscription-membership-source-writer";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal paid rollback", () => {
  it("should roll back the real staged membership, pending closure and notices without restoring the consumed token", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const scenario = await preparePersonalPaidMembership(database), { fixture, recipient } = scenario;
      /** @returns Observable original rows and scoped effect counts, never credential/contact material. */
      const snapshot = () => database.withContext(fixture.own, async (transaction) => ({
        member: (await transaction.execute(sql`select id,role,status,status_reason,commercial_recovery_status,subscription_membership_effect_id,created_at::text from public.tribe_members where id=${scenario.originalMember.id}`)).rows[0],
        request: (await transaction.execute(sql`select status,version,cancel_reason,decision_id,submitted_at::text,expires_at::text from public.academy_admission_requests where id=${scenario.requestId}`)).rows[0],
        invitation: (await transaction.execute(sql`select status,version,redeemed_request_id,redeemed_by_user_id,redeemed_at::text from public.academy_personal_invitations where id=${scenario.invitationId}`)).rows[0],
        binding: (await transaction.execute(sql`select id,owner_user_id,first_request_id,first_proof_id,created_at::text from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${recipient.userId}`)).rows[0],
        counts: (await transaction.execute(sql`select (select count(*)::integer from public.subscription_membership_effects where tribe_id=${fixture.tribeId}) as paid,(select count(*)::integer from public.academy_admission_decisions where request_id=${scenario.requestId}) as decisions,(select count(*)::integer from public.academy_admission_notification_obligations where request_id=${scenario.requestId} and event_type='cancelled') as obligations,(select count(*)::integer from public.notifications where tribe_id=${fixture.tribeId} and recipient_user_id=${recipient.userId} and type='admission_cancelled') as notices`)).rows[0],
      }));
      const before = await snapshot();
      expect(before.invitation).toMatchObject({ status: "redeemed", redeemed_request_id: scenario.requestId });
      let staged = false;
      const failAfterResolution: PaidAdmissionResolutionFactory = (transaction) => ({
        async resolvePaidMembership(scope) {
          await createPaidAdmissionResolutionWriter(transaction).resolvePaidMembership(scope);
          expect((await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where id=${scenario.requestId}`)).rows).toEqual([{ status: "cancelled", cancel_reason: "external_resolution" }]);
          expect((await transaction.execute(sql`select status from public.tribe_members where id=${scenario.originalMember.id}`)).rows).toEqual([{ status: "muted" }]);
          staged = true;
          await transaction.execute(sql`select 1/0`);
        },
      });
      const input = { priceId: scenario.priceId, tribeSlug: scenario.slug, source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton };
      let failure: unknown;
      try { await createSubscriptionMembershipReconciliationRepository(database, { userId: fixture.userId, email: null }, "authorized", failAfterResolution).reconcileProviderSubscribers(input); }
      catch (error) { failure = error; }
      expect(staged).toBe(true);
      const diagnostics: string[] = [];
      while (failure && typeof failure === "object") {
        if ("code" in failure && typeof failure.code === "string") diagnostics.push(failure.code);
        failure = "cause" in failure ? failure.cause : null;
      }
      expect(diagnostics).toContain("22012");
      expect(await snapshot()).toEqual(before);
      expect(await createSubscriptionMembershipReconciliationRepository(database, { userId: fixture.userId, email: null }, "authorized").reconcileProviderSubscribers(input)).toMatchObject({ status: "verified", verifiedCount: 1 });
      const committed = await snapshot();
      expect(committed.member).toMatchObject({ id: scenario.originalMember.id, status: "muted" });
      expect(committed.request).toMatchObject({ status: "cancelled", cancel_reason: "external_resolution" });
      expect(committed.invitation).toEqual(before.invitation);
      expect(committed.binding).toEqual(before.binding);
      expect(committed.counts).toEqual({ paid: 1, decisions: 1, obligations: 1, notices: 1 });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
