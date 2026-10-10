/** @vitest-environment node */
/** Exercises irreversible private tribe namespaces without bypassing admission-dependent deletion. @module admission-tribe-namespace-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("private admission tribe namespaces", () => {
  it("should register both sides of a real DML wait around the migration without losing a concurrently created tribe", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database), beforeTribeId = randomUUID(), afterTribeId = randomUUID();
      const horizon = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ deadline: string }>(sql`select clock_timestamp()+interval '60 seconds' as deadline`)).rows[0].deadline);
      let announceLock!: (pid: number) => void, rejectLock!: (error: unknown) => void, releaseLock!: () => void;
      const locked = new Promise<number>((resolve, reject) => { announceLock = resolve; rejectLock = reject; });
      const released = new Promise<void>((resolve) => { releaseLock = resolve; });
      const holder = database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`set local statement_timeout='10s'`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${beforeTribeId},'Synthetic before migration',${`before-${beforeTribeId}`},${fixture.userId})`);
        announceLock((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
        let releasedNow = false;
        void released.then(() => { releasedNow = true; });
        while (!releasedNow) {
          const row = (await transaction.execute<{ live: boolean }>(sql`select clock_timestamp()<${horizon}::timestamptz as live,pg_sleep(0.1)`)).rows[0];
          if (!row.live) throw new Error("Tribe namespace migration barrier exceeded its independent deadline");
        }
      });
      void holder.catch(rejectLock);
      const holderPid = await locked;
      const migration = database.applyMigration("20261010113000_preserve_admission_tribe_namespaces.sql");
      // The original promises remain rejected and are collected after releasing the barrier.
      void migration.catch(() => {});
      let createdAfter: Promise<unknown> | null = null, primaryError: unknown, observationFailed = false;
      try {
        const waitForBlocked = (minimum: number) => database.withContext(fixture.own, async (transaction) => {
          await transaction.execute(sql`set local statement_timeout='10s'`);
          for (let attempt = 0; attempt < 150; attempt += 1) {
            await transaction.execute(sql`select pg_stat_clear_snapshot()`);
            const row = (await transaction.execute<{ waiting: number; live: boolean }>(sql`with recursive blocked(pid) as (select pid from pg_stat_activity where wait_event_type='Lock' and ${holderPid}=any(pg_blocking_pids(pid)) union select activity.pid from pg_stat_activity activity join blocked blocker on blocker.pid=any(pg_blocking_pids(activity.pid)) where activity.wait_event_type='Lock') select count(*)::int as waiting,clock_timestamp()<${horizon}::timestamptz as live from blocked`)).rows[0];
            if (row.waiting >= minimum) return true;
            if (!row.live) throw new Error("Tribe namespace lock observation exceeded its independent deadline");
            await transaction.execute(sql`select pg_sleep(0.05)`);
          }
          return false;
        });
        expect(await waitForBlocked(1)).toBe(true);
        createdAfter = database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${afterTribeId},'Synthetic after migration',${`after-${afterTribeId}`},${fixture.userId})`));
        void createdAfter.catch(() => {});
        expect(await waitForBlocked(2)).toBe(true);
      } catch (error) { observationFailed = true; primaryError = error; }
      releaseLock();
      const results = await Promise.allSettled([holder, migration, ...(createdAfter ? [createdAfter] : [])]);
      const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
      if (observationFailed || failures.length) throw new AggregateError([...(observationFailed ? [primaryError] : []), ...failures], "Tribe namespace migration contention failed");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_tribe_namespaces where tribe_id in (${beforeTribeId},${afterTribeId}) and retired_at is null`)).rows).toEqual([{ total: 2 }]);
        await transaction.execute(sql`delete from public.tribes where id in (${beforeTribeId},${afterTribeId})`);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_tribe_namespaces where tribe_id in (${beforeTribeId},${afterTribeId}) and retired_at is not null`)).rows).toEqual([{ total: 2 }]);
      });
    }, { concurrentTransactions: 4 });
  }, 180_000);

  it("should retain a physically deleted empty tribe namespace without permitting retirement forgery, release or UUID reuse", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database), tribeId = randomUUID(), laterTribeId = randomUUID(), slug = `namespace-${tribeId}`;
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic namespace tribe',${slug},${fixture.userId})`));
      await database.applyMigration("20261010113000_preserve_admission_tribe_namespaces.sql");
      await database.grantTablesToNonBypass(["academy_admission_tribe_namespaces"]);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${laterTribeId},'Synthetic registered namespace',${`namespace-${laterTribeId}`},${fixture.userId})`);
        expect((await transaction.execute(sql`select retired_at is null as active from public.academy_admission_tribe_namespaces where tribe_id=${laterTribeId}`)).rows).toEqual([{ active: true }]);
        await transaction.execute(sql`delete from public.tribes where id=${laterTribeId}`);
        expect((await transaction.execute(sql`select retired_at is not null as retired from public.academy_admission_tribe_namespaces where tribe_id=${laterTribeId}`)).rows).toEqual([{ retired: true }]);
      });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_tribe_namespaces set retired_at=clock_timestamp() where tribe_id=${tribeId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select retired_at is null as active from public.academy_admission_tribe_namespaces where tribe_id=${tribeId}`)).rows).toEqual([{ active: true }]);
        await transaction.execute(sql`delete from public.tribes where id=${tribeId}`);
        expect((await transaction.execute(sql`select retired_at is not null as retired from public.academy_admission_tribe_namespaces where tribe_id=${tribeId}`)).rows).toEqual([{ retired: true }]);
      });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic reused namespace',${slug},${fixture.userId})`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.academy_admission_tribe_namespaces where tribe_id=${tribeId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_tribe_namespaces set retired_at=null where tribe_id=${tribeId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.tribes where id=${tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select tribe_id,retired_at is not null as retired from public.academy_admission_tribe_namespaces where tribe_id=${tribeId}`)).rows).toEqual([{ tribe_id: tribeId, retired: true }]);
      });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select tribe_id from public.academy_admission_tribe_namespaces where tribe_id=${tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`update public.academy_admission_tribe_namespaces set retired_at=null where tribe_id=${tribeId} returning tribe_id`)).rows).toEqual([]);
      }, "non_bypass");
    });
  }, 180_000);
});
