/** @vitest-environment node */
/** Exercises native applicant serialization, tenant fences and transaction cleanup on an owned PostgreSQL branch. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { withAdmissionTransitionContention } from "@/tests/support/admission-transition-contention";
import { ADMISSION_SUBMISSION_CONCURRENCY_TEST } from "@/tests/support/constants/admission-submission-concurrency";
import { lockAcademyAdmissionMembershipScope } from "@/src/modules/tribes/infrastructure/repositories/lock-academy-admission-membership-scope";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

/** @param database - Owned full-journal branch. @returns Real synthetic identities and an uncontrolled tribe for structural lock tests, without granting any admission. */
async function prepareScope(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationDatabase(database), tribeId = randomUUID(), otherUserId = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${otherUserId},'Synthetic scope account',${`${otherUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic scope tribe',${`scope-${tribeId}`},${fixture.userId})`);
  });
  return { ...fixture, tribeId, otherUserId };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native academy admission scope locks", () => {
  it("should serialize the same applicant and expose a membership inserted during the wait in the next statement", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareScope(database);
      const result = await withAdmissionTransitionContention(database, fixture.own, async (transaction) => {
        expect(await lockAcademyAdmissionMembershipScope(transaction, fixture.tribeId, fixture.userId)).toBe(true);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${fixture.userId},${TRIBE_MEMBER_ROLE.tribemate},${TRIBE_MEMBERSHIP_STATUS.active})`);
      }, () => database.withContext(fixture.own, async (transaction) => {
        expect(await lockAcademyAdmissionMembershipScope(transaction, fixture.tribeId, fixture.userId)).toBe(true);
        return (await transaction.execute<{ role: string; status: string }>(sql`select role,status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`)).rows[0];
      }));
      expect(result).toEqual({ status: "fulfilled", value: { role: TRIBE_MEMBER_ROLE.tribemate, status: TRIBE_MEMBERSHIP_STATUS.active } });
    }, { concurrentTransactions: ADMISSION_SUBMISSION_CONCURRENCY_TEST.concurrentTransactions });
  }, ADMISSION_SUBMISSION_CONCURRENCY_TEST.timeoutMs);

  it("should block non-key tenant updates under self admission and retain the exclusive fence for another beneficiary", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareScope(database);
      const update = await withAdmissionTransitionContention(database, fixture.own, async (transaction) => {
        expect(await lockAcademyAdmissionMembershipScope(transaction, fixture.tribeId, fixture.userId)).toBe(true);
      }, () => database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`update public.tribes set name=name where id=${fixture.tribeId} returning id`)).rows.length));
      expect(update).toEqual({ status: "fulfilled", value: 1 });
      const managed = await withAdmissionTransitionContention(database, fixture.own, async (transaction) => {
        expect(await lockAcademyAdmissionMembershipScope(transaction, fixture.tribeId, fixture.otherUserId)).toBe(true);
      }, () => database.withContext({ userId: fixture.otherUserId, email: null }, (transaction) => lockAcademyAdmissionMembershipScope(transaction, fixture.tribeId, fixture.otherUserId)));
      expect(managed).toEqual({ status: "fulfilled", value: true });
    }, { concurrentTransactions: ADMISSION_SUBMISSION_CONCURRENCY_TEST.concurrentTransactions });
  }, ADMISSION_SUBMISSION_CONCURRENCY_TEST.timeoutMs);

  it("should keep absent scope closed and release the applicant lock when its transaction rolls back", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareScope(database);
      expect(await database.withContext({ userId: null, email: null }, (transaction) => lockAcademyAdmissionMembershipScope(transaction, fixture.tribeId, fixture.userId))).toBe(false);
      expect(await database.withContext(fixture.own, (transaction) => lockAcademyAdmissionMembershipScope(transaction, randomUUID(), fixture.userId))).toBe(false);
      const rollback = new Error("Synthetic admission scope transaction rollback");
      let holderPid: number | undefined;
      await expect(database.withContext(fixture.own, async (transaction) => {
        expect(await lockAcademyAdmissionMembershipScope(transaction, fixture.tribeId, fixture.userId)).toBe(true);
        holderPid = (await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid;
        throw rollback;
      })).rejects.toBe(rollback);
      await database.withContext(fixture.own, async (transaction) => {
        expect(holderPid).toBeTypeOf("number");
        const retained = (await transaction.execute<{ locks: number }>(sql`select count(*)::int as locks from pg_locks where locktype='advisory' and pid=${holderPid}`)).rows[0];
        expect(retained.locks).toBe(0);
        expect(await lockAcademyAdmissionMembershipScope(transaction, fixture.tribeId, fixture.userId)).toBe(true);
      });
    });
  }, ADMISSION_SUBMISSION_CONCURRENCY_TEST.timeoutMs);
});
