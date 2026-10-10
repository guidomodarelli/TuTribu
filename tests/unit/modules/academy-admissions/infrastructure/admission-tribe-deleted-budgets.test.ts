/** @vitest-environment node */
/** Exercises global request and failure windows after physical tribe deletion with real persistence and crypto. @module admission-tribe-deleted-budgets-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import { PostgresVerificationRequestBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-request-budget";
import { PostgresVerificationFailureBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-failure-budget";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("deleted tribe global abuse windows", () => {
  it("should keep the original five requests and ten failures effective in another tribe after deletion", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), other = await createApplicant();
      await database.applyMigration("20261010100000_minimize_deleted_admission_contact_owners.sql");
      await database.applyMigration("20261010113000_preserve_admission_tribe_namespaces.sql");
      await database.applyMigration("20261010120000_archive_deleted_admission_tribe_provenance.sql");
      const contact = { type: "email" as const, value: fixture.own.email };
      const subject = await database.withContext(fixture.own, (transaction) => new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config).resolve(contact));
      const requestIds = Array.from({ length: 5 }, () => randomUUID()), failureIds = Array.from({ length: 10 }, () => randomUUID());
      await database.withContext(fixture.own, async (transaction) => {
        for (const operationId of requestIds) await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,contact_subject_id,purpose,channel,event_type,operation_id,occurred_at) values (${fixture.tribeId},${fixture.userId},${subject.subjectId},'admission','email','code_request',${operationId},clock_timestamp()-interval '2 minutes')`);
        for (const operationId of failureIds) await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,channel,event_type,operation_id,occurred_at) values (${fixture.tribeId},${fixture.userId},'admission','email','code_failure',${operationId},clock_timestamp()-interval '2 minutes')`);
      });
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string; occurred_at: string }>(sql`select id,occurred_at from public.messaging_usage_events where tribe_id=${fixture.tribeId} order by id`)).rows);
      const aliasCount = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ total: number }>(sql`select count(*)::int as total from public.messaging_contact_fingerprint_aliases where subject_id=${subject.subjectId}`)).rows[0].total);
      expect(aliasCount).toBeGreaterThan(0);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.tribeId}`));
      const nextTribeId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${nextTribeId},'Synthetic next budget tribe',${`budget-${nextTribeId}`},${fixture.userId})`));
      const scope: VerificationChallengeScope = { userId: fixture.userId, tribeId: nextTribeId, connectionId: randomUUID(), connectionVersion: 1, securityEpoch: fixture.config.securityEpoch, purpose: "admission", verificationEpoch: 1, channel: "email", contact };
      await database.withContext(fixture.own, async (transaction) => {
        const contacts = new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config);
        expect(await new PostgresVerificationRequestBudget(transaction, async () => true, contacts).consume({ scope, operationId: randomUUID(), challengeId: randomUUID() })).toMatchObject({ allowed: false, code: "usage_limit_reached" });
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        expect(await new PostgresVerificationFailureBudget(transaction).hasCapacity(fixture.userId, now)).toBe(false);
        expect((await transaction.execute(sql`select id,occurred_at from public.messaging_usage_events where tribe_id=${fixture.tribeId} order by id`)).rows).toEqual(before);
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_usage_events where tribe_id=${nextTribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_contact_fingerprint_aliases where subject_id=${subject.subjectId}`)).rows).toEqual([{ total: aliasCount }]);
      });
      const otherOwn = { userId: other.userId, email: other.email }, otherTribeId = randomUUID();
      await database.withContext(otherOwn, (transaction) => transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${otherTribeId},'Synthetic independent contact budget',${`contact-budget-${otherTribeId}`},${other.userId})`));
      await database.withContext(otherOwn, async (transaction) => {
        const contacts = new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config);
        expect(await new PostgresVerificationRequestBudget(transaction, async () => true, contacts).consume({ scope: { ...scope, userId: other.userId, tribeId: otherTribeId, purpose: "connection_diagnostic", verificationEpoch: null }, operationId: randomUUID(), challengeId: randomUUID() })).toMatchObject({ allowed: false, code: "usage_limit_reached" });
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_usage_events where actor_user_id=${other.userId}`)).rows).toEqual([{ total: 0 }]);
      });
    });
  }, 1_200_000);
});
