/** @vitest-environment node */
/** Isolates the native account ceiling from every contact ceiling across real scoped challenges. @module account-code-request-budget-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase, seedContactVerificationChallenge } from "@/tests/support/contact-verification-database-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { MESSAGING_USAGE_LIMIT } from "@/src/modules/messaging/constants/messaging-limits";
import { PostgresVerificationRequestBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-request-budget";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { VerificationRequestBudgetCommand } from "@/src/modules/academy-admissions/domain/repositories/verification-request-budget";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native isolated account code budget", () => {
  it("should reject the sixth account request across distinct contacts, channels and tribes without any contact reaching its own ceiling", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: one real actor, one email contact and five distinct phone contacts.
      const fixture = await prepareContactVerificationDatabase(database);
      await database.applyMigration("20261006120000_index_messaging_contact_windows.sql");
      const channels = ["email", "sms", "whatsapp", "sms", "whatsapp", "sms"] as const;
      const challenges: Awaited<ReturnType<typeof seedContactVerificationChallenge>>[] = [];
      for (const [index, channel] of channels.entries()) {
        challenges.push(await seedContactVerificationChallenge(database, fixture, "admission", undefined, undefined, channel, channel === "email" ? undefined : { type: "phone", value: `+549115550${String(index).padStart(4, "0")}`, country: "AR" }));
      }
      /** @param transaction - Actual guarded transaction. @param command - Exact persisted own challenge. @returns Current persisted authority for this accounting boundary. */
      const ownsChallenge = async (transaction: RequestDatabase, command: VerificationRequestBudgetCommand): Promise<boolean> => (await transaction.execute<{ allowed: boolean }>(sql`select exists(select 1 from public.contact_verification_challenges where id=${command.challengeId} and user_id=${fixture.userId} and tribe_id=${command.scope.tribeId} and connection_id=${command.scope.connectionId} and connection_version=${command.scope.connectionVersion} and purpose=${command.scope.purpose} and channel=${command.scope.channel} and contact_type=${command.scope.contact.type} and normalized_contact=${command.scope.contact.value} and is_current and state='issued' and expires_at>clock_timestamp()) as allowed`)).rows[0].allowed;
      /** @param challenge - Immutable challenge and its exact sealed scope. @param operationId - Native backend accounting operation. @returns The real account/contact budget result. */
      const consume = (challenge: Awaited<ReturnType<typeof seedContactVerificationChallenge>>, operationId: string) => database.withContext(fixture.own, (transaction) => {
        const command = { scope: challenge.scope, operationId, challengeId: challenge.challengeId };
        const contacts = new PostgresMessagingContactBudgetRepository(transaction, (current) => ownsChallenge(current, command), async () => fixture.config);
        return new PostgresVerificationRequestBudget(transaction, ownsChallenge, contacts).consume(command);
      });

      // Act: exhaust only the account's moving-hour budget with separately authorized contacts.
      const originals = challenges.slice(0, MESSAGING_USAGE_LIMIT.codeRequestsHourly).map((challenge) => ({ challenge, operationId: randomUUID() }));
      for (const original of originals) expect(await consume(original.challenge, original.operationId)).toMatchObject({ allowed: true, replayed: false });
      const deniedOperationId = randomUUID();
      expect(await consume(challenges[MESSAGING_USAGE_LIMIT.codeRequestsHourly], deniedOperationId)).toMatchObject({ allowed: false, code: "usage_limit_reached" });

      // Assert: every charged contact/tribe has only one event; the fresh contact has none.
      await database.withContext(fixture.own, async (transaction) => {
        const events = (await transaction.execute<{ contacts: number; tribes: number; events: number; largest_contact_count: number }>(sql`select count(distinct contact_subject_id)::integer as contacts,count(distinct tribe_id)::integer as tribes,count(*)::integer as events,(select max(event_count)::integer from (select count(*) as event_count from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_request' group by contact_subject_id) grouped) as largest_contact_count from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_request'`)).rows[0];
        expect(events).toEqual({ contacts: 5, tribes: 5, events: 5, largest_contact_count: 1 });
        expect((await transaction.execute(sql`select count(*)::integer as events from public.messaging_usage_events where challenge_id=${challenges[MESSAGING_USAGE_LIMIT.codeRequestsHourly].challengeId} or operation_id=${deniedOperationId}`)).rows).toEqual([{ events: 0 }]);
      });
      expect(await consume(originals[0].challenge, originals[0].operationId)).toMatchObject({ allowed: true, replayed: true });
      expect(await consume(challenges[MESSAGING_USAGE_LIMIT.codeRequestsHourly], randomUUID())).toMatchObject({ allowed: false, code: "usage_limit_reached" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as events from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_request'`)).rows).toEqual([{ events: 5 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
