/** @vitest-environment node */
/** Exercises paid reconciliation without changing pre-existing academy grants or course access. @module admission-membership-product-access-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";
import { PostgresCourseRepository } from "@/src/modules/courses/infrastructure/repositories/postgres-course-repository";
import { COURSE_ACCESS_REQUIREMENT, COURSE_VIEWER_ACCESS_STATUS } from "@/src/modules/courses/constants/courses";
import { PostgresProductAccessRepository } from "@/src/modules/product-access/infrastructure/repositories/postgres-product-access-repository";
import { ACCESS_GRANT_SOURCE_TYPE, ENROLLMENT_ACTIVATION_ORIGIN, PRODUCT_KEY, TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { PostgresTribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS, TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE, TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { createSubscriptionMembershipReconciliationRepository, seedSubscriptionMembershipReconciliation } from "@/tests/support/subscription-membership-reconciliation-fixture";
import { SUBSCRIPTION_MEMBERSHIP_ACCESS_CASES, SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT, SUBSCRIPTION_MEMBERSHIP_FIXTURE, SUBSCRIPTION_MEMBERSHIP_SQL_TEST_TIMEOUT_MS } from "@/tests/support/constants/subscription-membership-reconciliation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("payment membership sources and existing product access", () => {
  it.each(SUBSCRIPTION_MEMBERSHIP_ACCESS_CASES)("should preserve grants, enrollment and course access when $entrypoint reconciles $product", async ({ entrypoint, product }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await seedSubscriptionMembershipReconciliation(database, product, TRIBE_MEMBERSHIP_STATUS.muted);
      const grantId = randomUUID(), sourceKey = randomUUID(), basicCourseId = randomUUID(), academyCourseId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.tribeId},${TRIBE_ACCESS_MODEL.academy},true)`);
        await transaction.execute(sql`insert into public.member_access_grants(id,tribe_id,user_id,product_key,source_type,source_key,starts_at,ends_at,created_by) values (${grantId},${fixture.tribeId},${fixture.userId},${PRODUCT_KEY.academy},${ACCESS_GRANT_SOURCE_TYPE.manualBonus},${sourceKey},clock_timestamp()-interval '1 hour',clock_timestamp()+${SUBSCRIPTION_MEMBERSHIP_FIXTURE.grantLifetimeDays}*interval '1 day',${fixture.own.userId})`);
        await transaction.execute(sql`insert into public.member_product_enrollments(tribe_id,user_id,product_key,first_activated_at,activation_origin) select tribe_id,user_id,product_key,starts_at,${ENROLLMENT_ACTIVATION_ORIGIN.firstGrant} from public.member_access_grants where id=${grantId}`);
        await transaction.execute(sql`insert into public.courses(id,tribe_id,title,sort_order,access_requirement) values (${basicCourseId},${fixture.tribeId},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.basicCourseTitle},0,${COURSE_ACCESS_REQUIREMENT.membership}),(${academyCourseId},${fixture.tribeId},${SUBSCRIPTION_MEMBERSHIP_FIXTURE.academyCourseTitle},1,${COURSE_ACCESS_REQUIREMENT.academy})`);
      });
      const ownViewer = { userId: fixture.userId, email: null };
      const productAccess = new PostgresProductAccessRepository((callback) => database.withContext(ownViewer, callback));
      const courses = new PostgresCourseRepository((callback) => database.withContext(ownViewer, callback));
      /** Reads persisted identities and public access from actual repositories before/after payment. @returns Metadata with no provider credentials or transport payloads. */
      const snapshot = async () => ({
        access: await productAccess.readOwnAccessSnapshot({ tribeSlug: fixture.slug }),
        courses: await courses.getTreeByTribeSlug({ tribeSlug: fixture.slug }),
        stored: await database.withContext(fixture.own, async (transaction) => ({
          membership: (await transaction.execute(sql`select id,role,status,status_reason,created_at from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows,
          grants: (await transaction.execute(sql`select id,product_key,source_type,source_key,starts_at,ends_at,revoked_at,revoked_by,created_by,created_at from public.member_access_grants where tribe_id=${fixture.tribeId} and user_id=${fixture.userId} order by id`)).rows,
          enrollments: (await transaction.execute(sql`select product_key,first_activated_at,activation_origin,created_at from public.member_product_enrollments where tribe_id=${fixture.tribeId} and user_id=${fixture.userId} order by product_key`)).rows,
        })),
      });
      const before = await snapshot();
      expect(before.access).toMatchObject({ accessModel: TRIBE_ACCESS_MODEL.academy, membership: { role: TRIBE_MEMBER_ROLE.tribemate, status: TRIBE_MEMBERSHIP_STATUS.muted } });
      expect(before.access?.grants).toMatchObject([{ sourceType: ACCESS_GRANT_SOURCE_TYPE.manualBonus, revokedAt: null }]);
      expect(before.stored.enrollments).toHaveLength(1);
      expect(before.courses.courses.map((course) => ({ id: course.id, access: course.viewerAccess.status }))).toEqual([
        { id: basicCourseId, access: COURSE_VIEWER_ACCESS_STATUS.available },
        { id: academyCourseId, access: COURSE_VIEWER_ACCESS_STATUS.available },
      ]);

      if (entrypoint === SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.member) {
        const unexpected = async () => { throw new Error("AdmissionMembershipSourcesTest: provider mutation unexpectedly invoked"); };
        const repository = new PostgresTribeMemberSubscriptionRepository((callback) => database.withContext(fixture.own, callback), unexpected, unexpected, async () => SUBSCRIPTION_MEMBERSHIP_FIXTURE.providerAuthorizedStatus, unexpected, unexpected, unexpected, createPaidAdmissionResolutionWriter, randomUUID());
        expect(await repository.handleWebhook({ eventId: randomUUID(), resourceId: fixture.providerId, topic: SUBSCRIPTION_MEMBERSHIP_FIXTURE.providerWebhookTopic })).toMatchObject({ status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed });
      } else {
        const repository = createSubscriptionMembershipReconciliationRepository(database, fixture.own, SUBSCRIPTION_MEMBERSHIP_FIXTURE.providerAuthorizedStatus);
        const result = entrypoint === SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.price
          ? await repository.reconcileProviderSubscribers({ priceId: fixture.priceId, tribeSlug: fixture.slug, source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton })
          : await repository.reconcileSubscriberDiagnostics({ tribeSlug: fixture.slug });
        expect(result).toMatchObject({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified, verifiedCount: 1 });
      }
      const after = await snapshot();
      expect(after.stored).toEqual(before.stored);
      expect(after.access?.grants).toEqual(before.access?.grants);
      expect(after.access?.firstActivatedAt).toEqual(before.access?.firstActivatedAt);
      expect(after.courses).toEqual(before.courses);
      expect(after.access?.membership).toEqual(before.access?.membership);
    });
  }, SUBSCRIPTION_MEMBERSHIP_SQL_TEST_TIMEOUT_MS);
});
