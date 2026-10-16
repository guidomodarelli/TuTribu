/** @vitest-environment node */
/** Exercises finite keyset traversal across tied, suppressed, previously collected and concurrently changing real sources. @module admission-notification-source-selection-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationSourceSelection } from "@/tests/support/admission-notification-source-selection-fixture";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE } from "@/src/modules/notifications/constants/admission-notification-source-selection";
import { PostgresAdmissionNotificationSourceReader } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-source-reader";
import type { AdmissionNotificationSourceCursor, AdmissionNotificationSourcePage } from "@/src/modules/notifications/domain/repositories/admission-notification-source-reader";
import type { AdmissionNotificationRecipientEmailScope } from "@/src/modules/notifications/domain/entities/admission-notification-recipient-email";

/** @param source - Exact original source and recipient. @returns An assertion-only identity independent of how the adapter builds its SQL. */
const sourceKey = (source: AdmissionNotificationRecipientEmailScope) => JSON.stringify([source.tribeId, source.obligationId, source.recipientUserId, source.audience]);

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification source selection", () => {
  it("should advance a bounded finite sweep past untrusted and existing sources without losing tied or later work", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given unavailable optional-email facts, genuine existing collection and more tied original notices than two full pages.
      const fixture = await prepareAdmissionNotificationSourceSelection(database);
      const seeded = await fixture.createSources(ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE + 1, fixture.tiedMicroseconds);
      const existing: AdmissionNotificationRecipientEmailScope = { tribeId: fixture.tribeId, obligationId: fixture.obligationIds[1], recipientUserId: fixture.leaderId, audience: "reviewer" };
      const expectedKeys = [existing, ...seeded.sources].map(sourceKey).sort();
      const first = await fixture.read(null);
      expect(first.sources).toHaveLength(25);
      expect(first.sources[0]).toEqual(existing);
      expect(first.continuation).not.toBeNull();
      const continuation = first.continuation!;
      expect(continuation.after.createdAtMicroseconds).toBe(seeded.createdAtMicroseconds);

      // When an earlier returned notice is removed and genuinely newer facts arrive, the original upper bound and full tuple remain fixed.
      const removed = first.sources[1];
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.notifications where tribe_id=${removed.tribeId} and admission_obligation_id=${removed.obligationId} and recipient_user_id=${removed.recipientUserId} and admission_audience=${removed.audience}`));
      const late = await fixture.createSources(1);
      expect(late.createdAtMicroseconds).toBeGreaterThan(continuation.throughMicroseconds);
      const second = await fixture.read(continuation);
      expect(second.sources).toHaveLength(25);
      expect(await fixture.read(continuation)).toEqual(second);
      const pages: AdmissionNotificationSourcePage[] = [first, second];
      let cursor: AdmissionNotificationSourceCursor | null = second.continuation;
      while (cursor) {
        if (pages.length >= 4) throw new Error("The finite native source sweep did not reach its original end");
        const page = await fixture.read(cursor);
        pages.push(page);
        cursor = page.continuation;
      }

      // Then every original reference is examined once, including all equal-time recipient ties, while new facts wait for a fresh sweep.
      expect(pages.map((page) => page.sources.length)).toEqual([25, 25, 3]);
      const examined = pages.flatMap((page) => page.sources).map(sourceKey);
      expect(examined.toSorted()).toEqual(expectedKeys);
      expect(new Set(examined).size).toBe(examined.length);
      expect(examined.some((key) => late.sources.some((source) => sourceKey(source) === key))).toBe(false);
      const fresh: AdmissionNotificationRecipientEmailScope[] = [];
      cursor = null;
      do {
        const page = await fixture.read(cursor);
        fresh.push(...page.sources);
        cursor = page.continuation;
        if (fresh.length > expectedKeys.length + late.sources.length) throw new Error("Fresh native source traversal repeated earlier positions");
      } while (cursor);
      expect(fresh.map(sourceKey).sort()).toEqual([...expectedKeys.filter((key) => key !== sourceKey(removed)), ...late.sources.map(sourceKey)].sort());

      // Current backend authority and cursor scope remain mandatory, and traversal alone never creates an email or modifies the original member.
      await expect(fixture.read(null, fixture.otherTribeId)).rejects.toMatchObject({ code: "permission_denied" });
      await expect(fixture.read({ ...continuation, tribeId: fixture.otherTribeId })).rejects.toMatchObject({ code: "permission_denied" });
      await expect(fixture.read({ ...continuation, throughMicroseconds: Number.MAX_SAFE_INTEGER })).rejects.toMatchObject({ code: "invalid_input" });
      let checks = 0;
      await expect(database.withContext(fixture.own, (transaction) => new PostgresAdmissionNotificationSourceReader(transaction, async (current, tribeId) => ++checks === 1 && await fixture.authorize(current, tribeId)).readPage(fixture.tribeId, null))).rejects.toMatchObject({ code: "permission_denied" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.admission_notification_group_members where tribe_id=${fixture.tribeId}) as members,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId} and purpose='admission_notification') as deliveries,(select count(*)::int from public.admission_email_settings where tribe_id=${fixture.tribeId}) as email_settings,(select count(*)::int from public."user" where id in (${fixture.leaderId},${fixture.guardianId}) and "emailVerified") as trusted_accounts`)).rows)).toEqual([{ members: 1, deliveries: 0, email_settings: 0, trusted_accounts: 0 }]);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
