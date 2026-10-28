/** @vitest-environment node */
/** Exercises paid lifecycle recovery without inventing privileged roles or unknown history. @module academy-membership-lifecycle-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";
import { PostgresTribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS, TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE, TRIBE_SUBSCRIPTION_PRICE_STATUS, TRIBE_SUBSCRIPTION_PRODUCT_KEY } from "@/src/modules/subscriptions/constants/subscriptions";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS, TRIBE_MEMBERSHIP_STATUS_REASON } from "@/src/modules/tribes/constants/tribe-page-access";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { createSubscriptionMembershipReconciliationRepository, seedSubscriptionMembershipReconciliation } from "@/tests/support/subscription-membership-reconciliation-fixture";
import { PROTECTED_MEMBERSHIP_LIFECYCLE_CASES } from "@/tests/support/constants/academy-membership-lifecycle";
import { SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT, SUBSCRIPTION_MEMBERSHIP_FIXTURE, SUBSCRIPTION_MEMBERSHIP_SQL_TEST_TIMEOUT_MS } from "@/tests/support/constants/subscription-membership-reconciliation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("protected academy membership lifecycle", () => {
  it.each(PROTECTED_MEMBERSHIP_LIFECYCLE_CASES)("should preserve $role with historyKnown=$historyKnown when $entrypoint attempts paid recovery", async ({ entrypoint, role, historyKnown }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await seedSubscriptionMembershipReconciliation(database, TRIBE_SUBSCRIPTION_PRODUCT_KEY.membership, historyKnown ? TRIBE_MEMBERSHIP_STATUS.muted : TRIBE_MEMBERSHIP_STATUS.removed, historyKnown ? TRIBE_MEMBERSHIP_STATUS_REASON.none : TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive);
      const subjectUserId = role === TRIBE_MEMBER_ROLE.leader ? fixture.own.userId : fixture.userId;
      await database.withContext(fixture.own, async (transaction) => {
        if (role === TRIBE_MEMBER_ROLE.leader) {
          // The schema permits one leader regardless of status; use that existing instance.
          await transaction.execute(sql`update public.tribe_member_subscriptions set user_id=${subjectUserId} where id=${fixture.subscriptionId}`);
        } else {
          await transaction.execute(sql`update public.tribe_members set role=${role} where tribe_id=${fixture.tribeId} and user_id=${subjectUserId}`);
        }
        const instant = (await transaction.execute<{ instant: Date | string }>(sql`select clock_timestamp() as instant`)).rows[0].instant;
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${fixture.tribeId},true,${instant})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${fixture.tribeId}`);
        if (historyKnown) {
          if (role === TRIBE_MEMBER_ROLE.leader) await transaction.execute(sql`update public.tribe_members set status=${TRIBE_MEMBERSHIP_STATUS.muted} where tribe_id=${fixture.tribeId} and user_id=${subjectUserId}`);
          await transaction.execute(sql`update public.tribe_members set status=${TRIBE_MEMBERSHIP_STATUS.removed},status_reason=${TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive} where tribe_id=${fixture.tribeId} and user_id=${subjectUserId}`);
        }
      });
      /** Reads the native member and consumed authority, never credentials or provider payloads. @returns Observable persisted state from the owned branch. */
      const snapshot = () => database.withContext(fixture.own, async (transaction) => ({
        members: (await transaction.execute(sql`select id,role,status,status_reason,created_at,commercial_recovery_status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${subjectUserId}`)).rows,
        sources: (await transaction.execute(sql`select id,member_id,applied_at,revoked_at from public.subscription_membership_effects where tribe_id=${fixture.tribeId} order by id`)).rows,
        decisions: (await transaction.execute(sql`select id,outcome,membership_effect_id from public.academy_admission_decisions where tribe_id=${fixture.tribeId} order by id`)).rows,
      }));
      const before = await snapshot();
      expect(before.members).toMatchObject([{ role, status: TRIBE_MEMBERSHIP_STATUS.removed, commercial_recovery_status: historyKnown ? TRIBE_MEMBERSHIP_STATUS.muted : null }]);
      expect(before.sources).toEqual([]);
      expect(before.decisions).toEqual([]);
      if (entrypoint === SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.member) {
        const unexpected = async () => { throw new Error("AcademyMembershipLifecycleTest: provider mutation unexpectedly invoked"); };
        const repository = new PostgresTribeMemberSubscriptionRepository({ executeWithDatabase: (callback) => database.withContext(fixture.own, callback), createMercadoPagoPreapprovalSubscription: unexpected, getMercadoPagoPreapprovalDetails: unexpected, getMercadoPagoPreapprovalStatus: async () => SUBSCRIPTION_MEMBERSHIP_FIXTURE.providerAuthorizedStatus, updateMercadoPagoPreapprovalStatus: unexpected, updateMercadoPagoPreapprovalBackUrl: unexpected, refreshMercadoPagoAccessToken: unexpected, createAdmissionResolution: createPaidAdmissionResolutionWriter, requestId: randomUUID() });
        expect(await repository.handleWebhook({ eventId: randomUUID(), resourceId: fixture.providerId, topic: SUBSCRIPTION_MEMBERSHIP_FIXTURE.providerWebhookTopic })).toMatchObject({ status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed });
      } else {
        const repository = createSubscriptionMembershipReconciliationRepository(database, fixture.own, SUBSCRIPTION_MEMBERSHIP_FIXTURE.providerAuthorizedStatus);
        const result = entrypoint === SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.price
          ? await repository.reconcileProviderSubscribers({ priceId: fixture.priceId, tribeSlug: fixture.slug, source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton })
          : await repository.reconcileSubscriberDiagnostics({ tribeSlug: fixture.slug });
        if (role === TRIBE_MEMBER_ROLE.leader) expect(result).toMatchObject({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden });
        else expect(result).toMatchObject({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified, verifiedCount: 1 });
      }
      expect(await snapshot()).toEqual(before);
    });
  }, SUBSCRIPTION_MEMBERSHIP_SQL_TEST_TIMEOUT_MS);
});
