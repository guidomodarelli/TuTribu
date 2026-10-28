/** @vitest-environment node */
/** Exercises committed page progress, replay/CAS, native rollback, recovery guards and tenant retirement. @module admission-notification-collection-progress-tests */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationCollectionProgress } from "@/tests/support/admission-notification-collection-progress-fixture";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { admissionNotificationCollectionProgress } from "@/src/modules/shared/infrastructure/database/schema";
import { PostgresAdmissionNotificationCollectionProgress } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-collection-progress";
import type { AdmissionNotificationCollectionPageResult } from "@/src/modules/notifications/domain/repositories/admission-notification-collection-progress";

/** How long a page must stay blocked behind an uncommitted source creator to show that it waits for the tribe fence. */
const FENCE_OBSERVATION_MS = 3_000;
/** A late source is created this far behind the horizon already read. */
const LATE_SOURCE_OFFSET_MICROSECONDS = 1_000_000;

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification collection progress", () => {
  it("should commit source positions with groups, replay competing commands and start each later sweep after its frontier without duplicate members", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given no initializing write on a read, genuine selected email readiness and both collectable and deliberately omitted sources.
      const fixture = await prepareAdmissionNotificationCollectionProgress(database);
      expect(await fixture.repository.readProgress(fixture.tribeId)).toEqual({ tribeId: fixture.tribeId, version: 0, hasContinuation: false, lastPage: null, lastSweepCompletedAtMicroseconds: null, lastCertifiedThroughMicroseconds: null });
      expect(await fixture.execute(async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.admission_notification_collection_progress where tribe_id=${fixture.tribeId}`)).rows[0].count)).toBe(0);
      const seeded = await fixture.createSources(13);
      const command = { tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: 0 };
      const attempts = await Promise.allSettled([fixture.repository.collectPage(command), fixture.repository.collectPage(command)]);
      const failures = attempts.filter((attempt) => attempt.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map((attempt) => attempt.reason), "Native competing page collection did not confirm both outcomes");
      const results = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? [attempt.value] : []);
      expect(results).toHaveLength(2);
      expect(results.map((result) => result.replayed).toSorted((left, right) => Number(left) - Number(right))).toEqual([false, true]);
      const first = results.find((result) => !result.replayed)!;
      expect(first).toMatchObject({ previousVersion: 0, version: 1, examined: 25, sweepComplete: false, unavailable: 0, bucketClosed: 0 });
      expect(await fixture.repository.collectPage(command)).toEqual({ ...first, replayed: true });
      const stored = await fixture.execute(async (transaction) => (await transaction.select().from(admissionNotificationCollectionProgress).where(eq(admissionNotificationCollectionProgress.tribeId, fixture.tribeId)))[0]);
      expect(typeof stored.throughAt).toBe("string");
      expect(typeof stored.lastCompletedAt).toBe("string");
      const upper = await fixture.execute(async (transaction) => (await transaction.execute<{ instant: string }>(sql`select (extract(epoch from through_at)*1000000)::bigint::text as instant from public.admission_notification_collection_progress where tribe_id=${fixture.tribeId}`)).rows[0].instant);
      const late = await fixture.createSources(1);
      expect(late.createdAtMicroseconds).toBeGreaterThan(Number(upper));

      // When another transaction resumes, the persisted position and original upper clock continue independently of omitted recipients.
      await expect(fixture.repository.collectPage({ ...command, operationId: randomUUID() })).rejects.toMatchObject({ code: "request_conflict" });
      const secondCommand = { tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: 1 };
      let committedBeforeResponseLoss = false;
      const lostResponse = new PostgresAdmissionNotificationCollectionProgress(async (run) => {
        await fixture.execute(run);
        committedBeforeResponseLoss = true;
        throw new Error("Synthetic page response lost after the native commit");
      }, fixture.authorize, async () => fixture.keys.config);
      await expect(lostResponse.collectPage(secondCommand)).rejects.toMatchObject({ code: "operation_unresolved" });
      expect(committedBeforeResponseLoss).toBe(true);
      const second = (await fixture.repository.readProgress(fixture.tribeId)).lastPage!;
      expect(second).toMatchObject({ previousVersion: 1, version: 2, examined: 5, sweepComplete: true });
      expect(await fixture.repository.collectPage(secondCommand)).toEqual({ ...second, replayed: true });
      expect(first.examined + second.examined).toBe(30);
      expect(first.collected + second.collected).toBe(13);
      expect(first.suppressed + second.suppressed).toBe(17);
      expect(first.existing + second.existing).toBe(0);
      const completed = await fixture.repository.readProgress(fixture.tribeId);
      expect(completed).toMatchObject({ version: 2, hasContinuation: false, lastPage: second, lastSweepCompletedAtMicroseconds: second.completedAtMicroseconds, lastCertifiedThroughMicroseconds: first.sourceThroughMicroseconds });
      expect(second.sourceThroughMicroseconds).toBe(first.sourceThroughMicroseconds);
      expect(second.sweepHadUnavailable).toBe(false);
      await expect(fixture.repository.collectPage(command)).rejects.toMatchObject({ code: "request_conflict" });
      await expect(fixture.repository.collectPage({ ...secondCommand, expectedVersion: 0 })).rejects.toMatchObject({ code: "idempotency_conflict" });

      // Then a new sweep examines only the later facts after the frontier, preserves original members and reports current omissions without a provider delivery.
      const nextPages: AdmissionNotificationCollectionPageResult[] = [];
      let version = completed.version;
      do {
        if (nextPages.length >= 3) throw new Error("The resumed native collection sweep did not reach its original end");
        const page = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: version });
        nextPages.push(page);
        version = page.version;
      } while (!nextPages.at(-1)!.sweepComplete);
      expect(nextPages.map((page) => page.examined)).toEqual([2]);
      expect(nextPages[0]).toMatchObject({ collected: 1, existing: 0, suppressed: 1, sweepHadUnavailable: false });
      expect(nextPages[0].sourceThroughMicroseconds).toBeGreaterThanOrEqual(late.createdAtMicroseconds);
      expect(await fixture.repository.readProgress(fixture.tribeId)).toMatchObject({ lastCertifiedThroughMicroseconds: nextPages[0].sourceThroughMicroseconds });
      // A sweep with nothing new still certifies its newer horizon without examining any earlier source.
      const idle = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: version });
      expect(idle).toMatchObject({ examined: 0, sweepComplete: true });
      expect(idle.sourceThroughMicroseconds!).toBeGreaterThan(nextPages[0].sourceThroughMicroseconds!);
      expect(await fixture.repository.readProgress(fixture.tribeId)).toMatchObject({ lastCertifiedThroughMicroseconds: idle.sourceThroughMicroseconds });
      const members = await fixture.execute(async (transaction) => (await transaction.execute<{ obligation_id: string; recipient_user_id: string }>(sql`select obligation_id,recipient_user_id from public.admission_notification_group_members where tribe_id=${fixture.tribeId} order by obligation_id`)).rows);
      expect(members).toEqual([...seeded.sources, ...late.sources].map((source) => ({ obligation_id: source.obligation_id, recipient_user_id: fixture.leaderId })).sort((firstSource, secondSource) => firstSource.obligation_id.localeCompare(secondSource.obligation_id)));
      expect(await fixture.execute(async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.message_deliveries where tribe_id=${fixture.tribeId} and purpose='admission_notification'`)).rows[0].count)).toBe(0);
      await expect(fixture.repository.readProgress(fixture.otherTribeId)).rejects.toMatchObject({ code: "permission_denied" });
      await expect(fixture.repository.collectPage({ ...command, tribeId: fixture.otherTribeId })).rejects.toMatchObject({ code: "permission_denied" });
    }, { concurrentTransactions: 2 });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should roll back observed cursor and member writes on late authority or epoch failure and retain private storage until tribe retirement", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationCollectionProgress(database);
      await fixture.createSources(1);
      const command = { tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: 0 };
      let observedPermission = false, observedEpoch = false;
      /** @param transaction - Original live test transaction. @returns True only after both page progress and its actual collected member are staged. */
      const staged = async (transaction: Parameters<typeof fixture.authorize>[0]) => (await transaction.execute<{ staged: boolean }>(sql`select exists(select 1 from public.admission_notification_collection_progress where tribe_id=${fixture.tribeId} and version=1) and exists(select 1 from public.admission_notification_group_members where tribe_id=${fixture.tribeId}) as staged`)).rows[0].staged;
      const denied = new PostgresAdmissionNotificationCollectionProgress(fixture.execute, async (transaction, tribeId) => {
        if (await staged(transaction)) { observedPermission = true; return false; }
        return fixture.authorize(transaction, tribeId);
      }, async () => fixture.keys.config);
      await expect(denied.collectPage(command)).rejects.toMatchObject({ code: "permission_denied" });
      expect(observedPermission).toBe(true);
      const changedEpoch = randomUUID();
      const epochChanged = new PostgresAdmissionNotificationCollectionProgress(fixture.execute, async (transaction, tribeId) => {
        if (await staged(transaction)) observedEpoch = true;
        return fixture.authorize(transaction, tribeId);
      }, async () => observedEpoch ? { ...fixture.keys.config, securityEpoch: changedEpoch } : fixture.keys.config);
      await expect(epochChanged.collectPage(command)).rejects.toMatchObject({ code: "connection_incomplete" });
      expect(observedEpoch).toBe(true);
      expect(await fixture.repository.readProgress(fixture.tribeId)).toMatchObject({ version: 0, lastPage: null });
      expect(await fixture.execute(async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.admission_notification_collection_progress where tribe_id=${fixture.tribeId}) as checkpoints,(select count(*)::int from public.admission_notification_group_members where tribe_id=${fixture.tribeId}) as members,(select count(*)::int from public.admission_notification_groups where tribe_id=${fixture.tribeId}) as groups`)).rows)).toEqual([{ checkpoints: 0, members: 0, groups: 0 }]);
      const committed = await fixture.repository.collectPage(command);
      expect(committed).toMatchObject({ version: 1, examined: 6, collected: 1, suppressed: 5, sweepComplete: true });
      expect(await fixture.repository.collectPage(command)).toEqual({ ...committed, replayed: true });
      await database.grantTablesToNonBypass(["admission_notification_collection_progress"]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select tribe_id from public.admission_notification_collection_progress where tribe_id=${fixture.tribeId}`)).rows, "non_bypass")).toEqual([]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.admission_notification_collection_progress(tribe_id) values (${fixture.otherTribeId})`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      await expect(fixture.execute((transaction) => transaction.execute(sql`update public.admission_notification_collection_progress set last_operation_id=${randomUUID()} where tribe_id=${fixture.tribeId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(fixture.execute((transaction) => transaction.execute(sql`update public.admission_notification_collection_progress set version=version+1,last_operation_id=${randomUUID()},examined=26 where tribe_id=${fixture.tribeId}`))).rejects.toMatchObject({ cause: { code: "23514", constraint: "admission_notification_collection_progress_counts_check" } });
      await fixture.execute((transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.tribeId}`));
      expect(await database.withContext(fixture.system, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.admission_notification_collection_progress where tribe_id=${fixture.tribeId}`)).rows[0].count)).toBe(0);
      await expect(fixture.repository.collectPage(command)).rejects.toMatchObject({ code: "permission_denied" });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
  it("should commit only the first chunk after an elapsed soft deadline and resume right after its last collected source", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given four requests whose reviewer notices are more than one collection chunk but less than a page.
      const fixture = await prepareAdmissionNotificationCollectionProgress(database);
      await fixture.createSources(4);
      // The base fixture already seeds its own notices, so the sweep covers every reviewer notice of the tribe, not only these four.
      const sourceCount = await fixture.execute(async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.notifications notice join public.academy_admission_notification_obligations obligation on obligation.id=notice.admission_obligation_id and obligation.tribe_id=notice.tribe_id where notice.tribe_id=${fixture.tribeId}`)).rows[0].count);
      expect(sourceCount).toBeGreaterThan(5);
      expect(sourceCount).toBeLessThanOrEqual(25);
      // When the phase's soft deadline already elapsed, the page still collects one chunk and commits that partial progress.
      const cut = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: 0, softDeadlineAtMilliseconds: 0 });
      expect(cut).toMatchObject({ version: 1, examined: 5, sweepComplete: false });
      // Then the next page resumes after that exact source and finishes the sweep without examining any source twice.
      const rest = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: 1 });
      expect(rest).toMatchObject({ version: 2, examined: sourceCount - cut.examined, sweepComplete: true });
      const members = await fixture.execute(async (transaction) => (await transaction.execute<{ total: number; distinct_sources: number }>(sql`select count(*)::int as total,count(distinct (obligation_id,recipient_user_id))::int as distinct_sources from public.admission_notification_group_members where tribe_id=${fixture.tribeId}`)).rows[0]);
      expect(members.total).toBe(members.distinct_sources);
      expect(members.total).toBe(cut.collected + rest.collected);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should retry only unavailable sources in the next sweep and certify up to the oldest pending retry meanwhile", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given an email capability that is temporarily unusable while a sweep examines every source.
      const fixture = await prepareAdmissionNotificationCollectionProgress(database);
      await fixture.createSources(2);
      /** @returns Pending retries of this tribe and the creation clock of the oldest one, in exact microseconds. */
      const retries = () => fixture.execute(async (transaction) => (await transaction.execute<{ count: number; oldest: string | null }>(sql`select count(*)::int as count,(extract(epoch from min(source_created_at))*1000000)::bigint::text as oldest from public.admission_notification_collection_retries where tribe_id=${fixture.tribeId}`)).rows[0]);
      await fixture.execute((transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='unavailable' where connection_id=${fixture.connectionId} and channel='email'`));
      const first = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: 0 });
      expect(first).toMatchObject({ sweepComplete: true, sweepHadUnavailable: true, collected: 0 });
      const pending = await retries();
      expect(pending.count).toBeGreaterThan(0);
      expect(pending.count).toBeLessThanOrEqual(first.examined);
      // While retries are pending, every window from the oldest unavailable source on stays uncertified.
      expect((await fixture.repository.readProgress(fixture.tribeId)).lastCertifiedThroughMicroseconds).toBe(Number(pending.oldest) - 1);

      // When the capability recovers, the next sweep examines only those retries and then certifies its whole horizon.
      await fixture.execute((transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='prepared' where connection_id=${fixture.connectionId} and channel='email'`));
      const second = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: first.version });
      expect(second).toMatchObject({ examined: pending.count, sweepComplete: true, sweepHadUnavailable: false });
      expect(second.collected).toBeGreaterThan(0);
      expect(await retries()).toEqual({ count: 0, oldest: null });
      expect((await fixture.repository.readProgress(fixture.tribeId)).lastCertifiedThroughMicroseconds).toBe(second.sourceThroughMicroseconds);
      const third = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: second.version });
      expect(third).toMatchObject({ examined: 0, sweepComplete: true });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should wait behind an uncommitted source creator before reading its horizon so no source commits behind the frontier", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given a source creator that holds the tribe fence and has not committed yet.
      const fixture = await prepareAdmissionNotificationCollectionProgress(database);
      const settled = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: 0 });
      let releaseCreator!: () => void, signalStaged!: () => void;
      const creatorReleased = new Promise<void>((resolve) => { releaseCreator = resolve; });
      const creatorStaged = new Promise<void>((resolve) => { signalStaged = resolve; });
      const creator = fixture.createSources(1, { beforeCommit: () => { signalStaged(); return creatorReleased; } });
      await creatorStaged;

      // When a page starts meanwhile, it cannot read its horizon until the creator commits.
      const page = fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: settled.version });
      const raced = await Promise.race([page.then(() => "collected"), new Promise<string>((resolve) => setTimeout(() => resolve("waiting"), FENCE_OBSERVATION_MS))]);
      expect(raced).toBe("waiting");
      releaseCreator();
      const created = await creator;

      // Then the page examines the late-committing source inside its horizon instead of passing it.
      const collected = await page;
      expect(collected.sourceThroughMicroseconds!).toBeGreaterThanOrEqual(created.createdAtMicroseconds);
      expect(collected).toMatchObject({ examined: created.sources.length * 2, sweepComplete: true });
      const members = await fixture.execute(async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.admission_notification_group_members where tribe_id=${fixture.tribeId} and obligation_id=${created.sources[0].obligation_id}`)).rows[0].count);
      expect(members).toBe(1);
    }, { concurrentTransactions: 2 });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should queue a source created behind the horizon already read as a retry so the next sweep examines it", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given a completed sweep whose frontier is past the creation clock of a source that appears afterwards.
      const fixture = await prepareAdmissionNotificationCollectionProgress(database);
      const completed = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: 0 });
      expect(completed.sweepComplete).toBe(true);
      const late = await fixture.createSources(1, { originalMicroseconds: completed.sourceThroughMicroseconds! - LATE_SOURCE_OFFSET_MICROSECONDS });

      // When its notices are inserted, the safety net queues them as retries instead of leaving them behind the frontier.
      const queued = await fixture.execute(async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.admission_notification_collection_retries retry join public.notifications notice on notice.id=retry.notification_id where retry.tribe_id=${fixture.tribeId} and notice.admission_obligation_id=${late.sources[0].obligation_id}`)).rows[0].count);
      expect(queued).toBe(2);

      // Then the next sweep examines exactly those two notices, even though they precede its frontier.
      const next = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: completed.version });
      expect(next).toMatchObject({ examined: 2, sweepComplete: true });
      expect(next.examined - next.unavailable).toBe(2);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
