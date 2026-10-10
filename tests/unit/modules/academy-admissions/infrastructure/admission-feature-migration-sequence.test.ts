/** @vitest-environment node */
/** Exercises the real migration command and its replay exclusively on an owned database branch. @module admission-feature-migration-sequence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { executeAdmissionMigrationCommand } from "@/tests/support/admission-migration-command";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("complete admission migration sequence", () => {
  it("should apply the real registered feature sequence once and preserve physical retirement protection on replay", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const before = await database.withContext({ userId: null, email: null }, async (transaction) => ({
        history: (await transaction.execute<{ total: number; latest: string }>(sql`select count(*)::int as total,max(created_at)::text as latest from drizzle.__drizzle_migrations`)).rows[0],
        featureAbsent: (await transaction.execute<{ absent: boolean }>(sql`select to_regclass('public.academy_admission_policies') is null as absent`)).rows[0].absent,
      }));
      expect(before.featureAbsent).toBe(true);
      // The branch guard supplies both URLs in memory. The child process's
      // initial environment wins over development files in @next/env.
      await database.withServerEnvironment(async (environment) => {
        /** Runs the actual npm-script entrypoint without printing transport or driver output. @returns Nothing after a successful bounded migration process. */
        const migrate = () => executeAdmissionMigrationCommand({ ...environment, DATABASE_MIGRATION_URL: environment.DATABASE_URL });
        await migrate();
        const applied = await database.withContext({ userId: null, email: null }, async (transaction) => {
          expect((await transaction.execute(sql`select to_regclass('public.academy_admission_retired_bindings') is not null and to_regclass('public.academy_admission_retired_operations') is not null and to_regclass('public.academy_admission_retired_audit_events') is not null as ready`)).rows).toEqual([{ ready: true }]);
          return (await transaction.execute<{ total: number; latest: string }>(sql`select count(*)::int as total,max(created_at)::text as latest from drizzle.__drizzle_migrations`)).rows[0];
        });
        expect(applied.total - before.history.total).toBe(45);
        expect(BigInt(applied.latest) > BigInt(before.history.latest)).toBe(true);
        await migrate();
        await database.withContext({ userId: null, email: null }, async (transaction) => {
          expect((await transaction.execute(sql`select count(*)::int as total,max(created_at)::text as latest from drizzle.__drizzle_migrations`)).rows).toEqual([applied]);
        });
      });
      const userId = randomUUID(), tribeId = randomUUID();
      const context = { userId, email: `${userId}@example.test` };
      await database.withContext(context, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${userId},'Synthetic migration owner',${context.email},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values(${tribeId},'Synthetic migrated tribe',${`migrated-${tribeId}`},${userId})`);
      });
      await expect(database.withContext(context, async (transaction) => {
        await transaction.execute(sql`delete from public.tribes where id=${tribeId}`);
        throw new Error("Controlled complete-sequence retirement rollback");
      })).rejects.toThrow("Controlled complete-sequence retirement rollback");
      await database.withContext(context, async (transaction) => {
        expect((await transaction.execute(sql`select retired_at is null as active from public.academy_admission_tribe_namespaces where tribe_id=${tribeId}`)).rows).toEqual([{ active: true }]);
        await transaction.execute(sql`delete from public.tribes where id=${tribeId}`);
      });
      await database.withContext(context, async (transaction) => {
        expect((await transaction.execute(sql`select retired_at is not null as retired from public.academy_admission_tribe_namespaces where tribe_id=${tribeId}`)).rows).toEqual([{ retired: true }]);
      });
      await expect(database.withContext(context, (transaction) => transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values(${tribeId},'Synthetic reused tribe',${`reused-${tribeId}`},${userId})`))).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  }, 1_200_000);
});
