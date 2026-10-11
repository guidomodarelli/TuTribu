/** @vitest-environment node */
/** Exercises real free commercial recovery and its independent authority across paid entrypoints. @module academy-free-membership-lifecycle-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildAcademyAdmissionsModule, createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresCourseRepository } from "@/src/modules/courses/infrastructure/repositories/postgres-course-repository";
import { PostgresProductAccessRepository } from "@/src/modules/product-access/infrastructure/repositories/postgres-product-access-repository";
import { PostgresTribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import { TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE } from "@/src/modules/subscriptions/constants/subscriptions";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalPaidMembership } from "@/tests/support/personal-paid-membership-fixture";
import { createSubscriptionMembershipReconciliationRepository } from "@/tests/support/subscription-membership-reconciliation-fixture";
import { SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT, SUBSCRIPTION_MEMBERSHIP_FIXTURE } from "@/tests/support/constants/subscription-membership-reconciliation";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native free commercial membership recovery", () => {
  it.each([SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.price, SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.diagnostics, SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.member])("should preserve a real free muted recovery when an old subscription expires through %s", async (entrypoint) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: real pre-cutover muted history, commercial removal and personal pending.
      const scenario = await preparePersonalPaidMembership(database);
      const { fixture, recipient } = scenario;
      const basicCourseId = randomUUID(), academyCourseId = randomUUID(), grantId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.member_access_grants(id,tribe_id,user_id,product_key,source_type,source_key,starts_at,ends_at,revoked_at,revoked_by,created_by) values (${grantId},${fixture.tribeId},${recipient.userId},'academy','manual_bonus',${randomUUID()},clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',clock_timestamp(),${fixture.userId},${fixture.userId})`);
        await transaction.execute(sql`insert into public.member_product_enrollments(tribe_id,user_id,product_key,first_activated_at,activation_origin) select tribe_id,user_id,product_key,starts_at,'first_grant' from public.member_access_grants where id=${grantId}`);
        await transaction.execute(sql`insert into public.courses(id,tribe_id,title,sort_order,access_requirement) values (${basicCourseId},${fixture.tribeId},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.basicCourseTitle},0,'membership'),(${academyCourseId},${fixture.tribeId},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.academyCourseTitle},1,'academy')`);
      });
      /** Reads persisted authority, commercial resources and public access without credentials. @returns Exact native state and actual repository results. */
      const snapshot = async () => ({
        stored: await database.withContext(fixture.own, async (transaction) => ({
          member: (await transaction.execute(sql`select id,role,status,status_reason,created_at::text,commercial_recovery_status,admission_membership_effect_id from public.tribe_members where id=${scenario.originalMember.id}`)).rows[0],
          basic: (await transaction.execute(sql`select member_id,target_status,applied_at is not null as consumed,revoked_at::text from public.academy_admission_membership_effects where request_id=${scenario.requestId}`)).rows,
          paid: (await transaction.execute(sql`select id from public.subscription_membership_effects where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows,
          subscription: (await transaction.execute(sql`select id,status,product_key from public.tribe_member_subscriptions where id=${scenario.subscriptionId}`)).rows,
          grants: (await transaction.execute(sql`select id,starts_at::text,ends_at::text,revoked_at::text,revoked_by from public.member_access_grants where tribe_id=${fixture.tribeId} and user_id=${recipient.userId} order by id`)).rows,
          enrollments: (await transaction.execute(sql`select product_key,first_activated_at::text,activation_origin,created_at::text from public.member_product_enrollments where tribe_id=${fixture.tribeId} and user_id=${recipient.userId} order by product_key`)).rows,
          decisions: (await transaction.execute(sql`select id,outcome,actor_kind,decided_at::text from public.academy_admission_decisions where request_id=${scenario.requestId} order by id`)).rows,
        })),
        access: await new PostgresProductAccessRepository((run) => database.withContext({ userId: recipient.userId, email: recipient.email }, run)).readOwnAccessSnapshot({ tribeSlug: scenario.slug }),
        courses: await new PostgresCourseRepository((run) => database.withContext({ userId: recipient.userId, email: recipient.email }, run)).getTreeByTribeSlug({ tribeSlug: scenario.slug }),
      });
      const before = await snapshot();
      expect(before.stored.member).toMatchObject({ ...scenario.originalMember, status: "removed", status_reason: "subscription_inactive", commercial_recovery_status: "muted", admission_membership_effect_id: null });
      expect(before.stored.basic).toEqual([]);
      expect(before.stored.paid).toEqual([]);
      expect(before.stored.grants).toMatchObject([{ id: grantId, revoked_at: expect.any(String) }]);
      expect(before.stored.enrollments).toHaveLength(1);

      // Act: the current owner makes and consumes its actual decision atomically.
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admission = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
      expect(await admission.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: scenario.requestId, expectedVersion: 2, confirmed: true, decision: "approve", internalReason: "Recuperación básica vigente", externalMessage: null })).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved" } } });
      const admitted = await snapshot();
      expect(admitted.stored.member).toMatchObject({ ...scenario.originalMember, status: "muted", status_reason: "none", commercial_recovery_status: "muted", admission_membership_effect_id: expect.any(String) });
      expect(admitted.stored.basic).toEqual([{ member_id: scenario.originalMember.id, target_status: "muted", consumed: true, revoked_at: null }]);
      expect(admitted.stored.paid).toEqual([]);
      expect(admitted.stored.subscription).toEqual(before.stored.subscription);
      expect(admitted.stored.grants).toEqual(before.stored.grants);
      expect(admitted.stored.enrollments).toEqual(before.stored.enrollments);
      expect(admitted.stored.decisions).toMatchObject([{ outcome: "approved", actor_kind: "user" }]);
      expect(admitted.stored.decisions).toHaveLength(1);
      expect(admitted.access?.membership).toMatchObject({ status: "muted", role: "tribemate" });
      expect(admitted.courses.courses.map((course) => ({ id: course.id, status: course.viewerAccess.status }))).toEqual([{ id: basicCourseId, status: "available" }, { id: academyCourseId, status: "academy_required" }]);

      // Assert: an old paid source can reconcile its own state without revoking basic admission.
      if (entrypoint === SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.member) {
        const unexpected = async () => { throw new Error("AcademyFreeMembershipLifecycleTest: provider mutation unexpectedly invoked"); };
        const paid = new PostgresTribeMemberSubscriptionRepository((run) => database.withContext({ userId: fixture.userId, email: null }, run), unexpected, unexpected, async () => "cancelled", unexpected, unexpected, unexpected, createPaidAdmissionResolutionWriter, randomUUID());
        expect(await paid.handleWebhook({ eventId: randomUUID(), resourceId: scenario.providerId, topic: SUBSCRIPTION_MEMBERSHIP_FIXTURE.providerWebhookTopic })).toMatchObject({ status: "processed" });
      } else {
        const paid = createSubscriptionMembershipReconciliationRepository(database, { userId: fixture.userId, email: null }, "cancelled");
        const result = entrypoint === SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.price
          ? await paid.reconcileProviderSubscribers({ priceId: scenario.priceId, tribeSlug: scenario.slug, source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton })
          : await paid.reconcileSubscriberDiagnostics({ tribeSlug: scenario.slug });
        expect(result).toMatchObject({ status: "verified", verifiedCount: 1 });
      }
      expect(await snapshot()).toEqual(admitted);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
