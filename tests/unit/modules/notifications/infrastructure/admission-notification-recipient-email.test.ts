/** @vitest-environment node */
/** Exercises current native email evidence, scoped historical proof and invalidation after a real lock wait. @module native-admission-notification-recipient-email-test */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationRecipientEmails } from "@/tests/support/admission-notification-recipient-email-fixture";
import { withAdmissionTransitionContention } from "@/tests/support/admission-transition-contention";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { PostgresAdmissionNotificationRecipientEmailReader } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-recipient-email-reader";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification recipient email", () => {
  it("should resolve current linked account email without a live session and reject invalidation or lost reviewer authority", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationRecipientEmails(database);
      await database.withContext(fixture.own, async (transaction) => {
        const reader = new PostgresAdmissionNotificationRecipientEmailReader(transaction, async () => fixture.runtime);
        expect(await reader.read(fixture.scopes[0])).toEqual({ ...fixture.scopes[0], normalizedEmail: fixture.emails[0] });
        // Cosmetic normalization preserves the current capture, including dots and tags.
        await transaction.execute(sql`update public."user" set email=${`  ${fixture.emails[0].toUpperCase()}  `} where id=${fixture.applicantIds[0]}`);
        expect(await reader.read(fixture.scopes[0])).toEqual({ ...fixture.scopes[0], normalizedEmail: fixture.emails[0] });
        expect(await reader.read(fixture.reviewScope)).toEqual({ ...fixture.reviewScope, normalizedEmail: `${fixture.guardianId}@gmail.com` });
        await transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardianId}`);
        expect(await reader.read(fixture.reviewScope)).toBeNull();
        await transaction.execute(sql`update public."user" set email='synthetic-change@example.invalid' where id=${fixture.applicantIds[0]}`);
        await transaction.execute(sql`update public."user" set email=${fixture.emails[0]} where id=${fixture.applicantIds[0]}`);
        expect(await reader.read(fixture.scopes[0])).toBeNull();
        expect(await reader.read({ ...fixture.scopes[3], tribeId: fixture.tribeId })).toBeNull();
        expect(await reader.read({ ...fixture.scopes[0], recipientUserId: fixture.applicantIds[3] })).toBeNull();
      });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should retain only an original applied email proof and never infer account email from a phone or generic flag", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationRecipientEmails(database);
      const before = await database.withContext(fixture.system, async (transaction) => (await transaction.execute(sql`select status,verified_at::text,apply_before::text,applied_at::text,applied_request_id,apply_before<clock_timestamp() as original_window_elapsed from public.academy_admission_verification_proofs where id=${fixture.proofIds[1]}`)).rows[0]);
      expect(before.original_window_elapsed).toBe(true);
      await database.withContext(fixture.system, async (transaction) => {
        const reader = new PostgresAdmissionNotificationRecipientEmailReader(transaction, async () => fixture.runtime);
        expect(await reader.read(fixture.scopes[1])).toEqual({ ...fixture.scopes[1], normalizedEmail: fixture.emails[1] });
        expect((await transaction.execute(sql`select "emailVerified" as generic_verified from public."user" where id=${fixture.applicantIds[2]}`)).rows).toEqual([{ generic_verified: true }]);
        expect(await reader.read(fixture.scopes[2])).toBeNull();
        expect(await reader.read({ ...fixture.scopes[1], obligationId: fixture.scopes[3].obligationId })).toBeNull();
        expect(await new PostgresAdmissionNotificationRecipientEmailReader(transaction, async () => ({ ...fixture.runtime, securityEpoch: "another-synthetic-epoch" })).read(fixture.scopes[1])).toBeNull();
        expect(await new PostgresAdmissionNotificationRecipientEmailReader(transaction, async () => ({ ...fixture.runtime, environment: "another-synthetic-environment" })).read(fixture.scopes[1])).toBeNull();
      });
      expect(await database.withContext(fixture.system, async (transaction) => (await transaction.execute(sql`select status,verified_at::text,apply_before::text,applied_at::text,applied_request_id,apply_before<clock_timestamp() as original_window_elapsed from public.academy_admission_verification_proofs where id=${fixture.proofIds[1]}`)).rows[0])).toEqual(before);
      expect(await database.withContext(fixture.system, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.tribe_members where user_id in (${sql.join(fixture.applicantIds.map((userId) => sql`${userId}`), sql`,`)})`)).rows[0].count)).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should reread current capture after an actual account lock wait instead of returning the pre-wait identity", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationRecipientEmails(database);
      const outcome = await withAdmissionTransitionContention(database, fixture.system,
        async (transaction) => {
          await transaction.execute(sql`select id from public.account where id=${fixture.accountIds.get(fixture.applicantIds[0])!} for update`);
          await transaction.execute(sql`update public.global_identity_evidence set invalidated_at=clock_timestamp(),invalidation_reason='synthetic_identity_retirement' where user_id=${fixture.applicantIds[0]} and invalidated_at is null`);
        },
        () => database.withContext(fixture.system, (transaction) => new PostgresAdmissionNotificationRecipientEmailReader(transaction, async () => fixture.runtime).read(fixture.scopes[0])),
      );
      expect(outcome).toEqual({ status: "fulfilled", value: null });
    }, { concurrentTransactions: 3 });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
