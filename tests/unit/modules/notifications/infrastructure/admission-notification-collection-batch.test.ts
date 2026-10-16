/** @vitest-environment node */
/** Exercises bounded same-page collection against real native facts and commit/rollback owners. @module admission-notification-collection-batch-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationCollectionProgress } from "@/tests/support/admission-notification-collection-progress-fixture";
import { withAdmissionTransitionContention } from "@/tests/support/admission-transition-contention";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import type { AdmissionNotificationRecipientEmailScope } from "@/src/modules/notifications/domain/entities/admission-notification-recipient-email";
import { PostgresAdmissionNotificationRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-repository";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission collection page batch", () => {
  it("should share readiness across a bounded mixed-recipient page and recover original members without reading current configuration", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationCollectionProgress(database), created = await fixture.createSources(11);
      /** @param obligationId - Existing original notice source. @param recipientUserId - Its native reviewer. @returns Only the original own server coordinates. */
      const scope = (obligationId: string, recipientUserId: string): AdmissionNotificationRecipientEmailScope => ({ tribeId: fixture.tribeId, obligationId, recipientUserId, audience: "reviewer" });
      const small = [scope(created.sources[0].obligation_id, fixture.leaderId), scope(created.sources[0].obligation_id, fixture.guardianId)];
      const page = created.sources.slice(1).flatMap((source) => [scope(source.obligation_id, fixture.leaderId), scope(source.obligation_id, fixture.guardianId)]);
      /** @param sources - Exact current mixed-recipient page. @returns Its committed outcomes and the own runtime port's shared read count, excluding each new member's final guard. */
      const collect = (sources: readonly AdmissionNotificationRecipientEmailScope[]) => fixture.execute(async (transaction) => {
        let runtimeReads = 0;
        const repository = new PostgresAdmissionNotificationRepository(transaction, fixture.authorize, async () => { runtimeReads++; return fixture.keys.config; });
        const results = await repository.collectMany(fixture.tribeId, sources);
        return { results, sharedRuntimeReads: runtimeReads - results.filter((result) => result.status === "collected").length };
      });
      const first = await collect(small), full = await collect(page);
      expect(first.results.map((result) => result.status)).toEqual(["collected", "suppressed"]);
      expect(full.results.map((result) => result.status)).toEqual(Array.from({ length: 10 }, () => ["collected", "suppressed"]).flat());
      expect(full.sharedRuntimeReads).toBe(first.sharedRuntimeReads);
      expect(first.sharedRuntimeReads).toBeGreaterThan(0);
      const originalScopes = [small[0], ...page.filter((entry) => entry.recipientUserId === fixture.leaderId)];
      const originalResults = [first.results[0], ...full.results.filter((result) => result.status === "collected")];
      let configurationRead = false;
      const replay = await fixture.execute((transaction) => new PostgresAdmissionNotificationRepository(transaction, fixture.authorize, async () => { configurationRead = true; throw new Error("Synthetic configuration is unavailable after original collection"); }).collectMany(fixture.tribeId, originalScopes));
      expect(configurationRead).toBe(false);
      expect(replay).toEqual(originalResults.map((result) => ({ status: "existing", groupId: "groupId" in result ? result.groupId : null, memberState: "pending" })));

      await fixture.execute(async (transaction) => {
        let authorizations = 0;
        const repository = new PostgresAdmissionNotificationRepository(transaction, async () => { authorizations++; return true; }, async () => { throw new Error("Invalid or empty pages must not read private configuration"); });
        await expect(repository.collectMany(fixture.tribeId, Array.from({ length: 26 }, () => scope(randomUUID(), fixture.leaderId)))).rejects.toMatchObject({ code: "invalid_input" });
        await expect(repository.collectMany(fixture.tribeId, [small[0], small[0]])).rejects.toMatchObject({ code: "invalid_input" });
        await expect(repository.collectMany(fixture.tribeId, [small[0], { ...small[0], obligationId: small[0].obligationId.toUpperCase() }])).rejects.toMatchObject({ code: "invalid_input" });
        await expect(repository.collectMany(fixture.tribeId, [{ ...small[0], tribeId: fixture.otherTribeId }])).rejects.toMatchObject({ code: "invalid_input" });
        expect(authorizations).toBe(0);
        expect(await repository.collectMany(fixture.tribeId, [])).toEqual([]);
        expect(authorizations).toBe(1);
        await expect(new PostgresAdmissionNotificationRepository(transaction, async () => false, async () => fixture.keys.config).collectMany(fixture.tribeId, [])).rejects.toMatchObject({ code: "permission_denied" });
        expect((await transaction.execute(sql`select count(*)::int as members from public.admission_notification_group_members where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ members: 11 }]);
        expect((await transaction.execute(sql`select count(*)::int as deliveries from public.message_deliveries where tribe_id=${fixture.tribeId} and purpose='admission_notification'`)).rows).toEqual([{ deliveries: 0 }]);
      });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should re-read each original source after an observed deletion wait and preserve the unaffected source outcome in cursor order", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationCollectionProgress(database), created = await fixture.createSources(2);
      const scopes = created.sources.map((source): AdmissionNotificationRecipientEmailScope => ({ tribeId: fixture.tribeId, obligationId: source.obligation_id, recipientUserId: fixture.leaderId, audience: "reviewer" }));
      const result = await withAdmissionTransitionContention(database, { userId: created.sources[0].user_id, email: null }, async (transaction) => {
        await transaction.execute(sql`select id from public.academy_admission_requests where id=${created.sources[0].request_id} for update`);
        await transaction.execute(sql`delete from public."user" where id=${created.sources[0].user_id}`);
      }, () => fixture.execute((transaction) => new PostgresAdmissionNotificationRepository(transaction, fixture.authorize, async () => fixture.keys.config).collectMany(fixture.tribeId, scopes)));
      expect(result.status).toBe("fulfilled");
      if (result.status !== "fulfilled") throw new Error("Native page collection did not complete after the observed source deletion wait");
      expect(result.value.map((outcome) => outcome.status)).toEqual(["unavailable", "collected"]);
      expect(await fixture.execute(async (transaction) => (await transaction.execute(sql`select obligation_id from public.admission_notification_group_members where tribe_id=${fixture.tribeId}`)).rows)).toEqual([{ obligation_id: created.sources[1].obligation_id }]);
    }, { concurrentTransactions: 3 });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should roll back all staged groups and members after a late runtime epoch change and allow a genuine subsequent collection", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationCollectionProgress(database), created = await fixture.createSources(2);
      const scopes = created.sources.map((source): AdmissionNotificationRecipientEmailScope => ({ tribeId: fixture.tribeId, obligationId: source.obligation_id, recipientUserId: fixture.leaderId, audience: "reviewer" }));
      let observedStagedMember = false;
      await expect(fixture.execute((transaction) => new PostgresAdmissionNotificationRepository(transaction, fixture.authorize, async () => {
        const staged = (await transaction.execute<{ staged: boolean }>(sql`select exists(select 1 from public.admission_notification_group_members where tribe_id=${fixture.tribeId}) as staged`)).rows[0].staged;
        if (staged) { observedStagedMember = true; return { ...fixture.keys.config, securityEpoch: randomUUID() }; }
        return fixture.keys.config;
      }).collectMany(fixture.tribeId, scopes))).rejects.toMatchObject({ code: "connection_incomplete" });
      expect(observedStagedMember).toBe(true);
      expect(await fixture.execute(async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.admission_notification_group_members where tribe_id=${fixture.tribeId}) as members,(select count(*)::int from public.admission_notification_groups where tribe_id=${fixture.tribeId}) as groups`)).rows)).toEqual([{ members: 0, groups: 0 }]);
      const recovered = await fixture.execute((transaction) => new PostgresAdmissionNotificationRepository(transaction, fixture.authorize, async () => fixture.keys.config).collectMany(fixture.tribeId, scopes));
      expect(recovered.map((result) => result.status)).toEqual(["collected", "collected"]);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
