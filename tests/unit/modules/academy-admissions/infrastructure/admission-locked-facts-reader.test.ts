/** @vitest-environment node */
/** Verifies native ordered snapshots, retained locks and invoker privileges without platform doubles. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { withAdmissionTransitionContention } from "@/tests/support/admission-transition-contention";
import { readPostgresTestDiagnostics } from "@/tests/support/postgres-test-diagnostics";
import { ADMISSION_LOCKED_FACTS_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-locked-facts-validation";
import { readLockedAdmissionFacts } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-locked-admission-facts";
import { readAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-storage";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native locked admission facts", () => {
  it("should preserve current facts after lock waits, retain locks and keep the caller's privileges", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const tribeId = randomUUID(), applicantId = randomUUID(), initialEmail = `${applicantId}@example.test`, changedEmail = `updated-${applicantId}@example.test`;
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicantId},'Synthetic facts applicant',${initialEmail},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic facts academy',${`facts-${tribeId}`},${fixture.userId})`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},${TRIBE_ACCESS_MODEL.academy},true)`);
      });
      await database.withServerEnvironment(async (environment) => {
        const pool = new Pool({ connectionString: environment.DATABASE_URL, max: 1 });
        try {
          const native = await pool.query("select * from public.read_locked_admission_facts($1::uuid,$2::text)", [tribeId, applicantId]);
          expect(native.rows[0]).toMatchObject({ policy: null, membership: null, account: { email: initialEmail } });
        } catch (error) {
          process.stdout.write(JSON.stringify({ phase: "locked_facts_native_query_failed", ...readPostgresTestDiagnostics(error) }) + "\n");
          throw error;
        } finally { await pool.end(); }
      });
      const absentPolicy = await database.withContext(fixture.own, (transaction) => readLockedAdmissionFacts(transaction, tribeId, applicantId));
      expect(absentPolicy).toMatchObject({ tribe: { accessModel: TRIBE_ACCESS_MODEL.academy, admissionEnabled: true, activatedAt: null }, policy: null, membership: null, account: { email: initialEmail } });
      const missingAccount = await database.withContext(fixture.own, (transaction) => readLockedAdmissionFacts(transaction, tribeId, randomUUID()));
      expect(missingAccount.account).toBeNull();

      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,changed_by_user_id) values (${tribeId},${fixture.userId})`));
      await database.withContext(fixture.own, async (transaction) => {
        const state = await readLockedAdmissionFacts(transaction, tribeId, applicantId);
        expect(state.policy).toEqual(await readAdmissionPolicy(transaction, tribeId, false));
        expect(state.policy?.version).toBe(VALIDATION.initialPolicyVersion);
      });

      const refreshed = await withAdmissionTransitionContention(database, fixture.own, async (transaction) => {
        await transaction.execute(sql`select tribe_id from public.tribe_academy_settings where tribe_id=${tribeId} for update`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_whatsapp_number=true,version=version+1,updated_at=clock_timestamp() where tribe_id=${tribeId}`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${applicantId},${TRIBE_MEMBER_ROLE.tribemate},${TRIBE_MEMBERSHIP_STATUS.active})`);
        await transaction.execute(sql`update public."user" set email=${changedEmail} where id=${applicantId}`);
      }, () => database.withContext(fixture.own, (transaction) => readLockedAdmissionFacts(transaction, tribeId, applicantId)));
      expect(refreshed).toMatchObject({ status: "fulfilled", value: { policy: { version: VALIDATION.changedPolicyVersion, requiresWhatsappNumber: true }, membership: { userId: applicantId, role: TRIBE_MEMBER_ROLE.tribemate, status: TRIBE_MEMBERSHIP_STATUS.active }, account: { email: changedEmail } } });

      const retained = await withAdmissionTransitionContention(database, fixture.own, async (transaction) => {
        await readLockedAdmissionFacts(transaction, tribeId, applicantId);
      }, () => database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`update public.academy_admission_policies set requires_whatsapp_number=false,updated_at=clock_timestamp(),version=version+1 where tribe_id=${tribeId} returning tribe_id`)).rows.length));
      expect(retained).toEqual({ status: "fulfilled", value: 1 });

      const lockedRows: { name: string; update: (transaction: RequestDatabase) => Promise<number> }[] = [
        { name: "settings", update: async (transaction) => (await transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=admission_enabled where tribe_id=${tribeId} returning tribe_id`)).rows.length },
        { name: "membership", update: async (transaction) => (await transaction.execute(sql`update public.tribe_members set status=status where tribe_id=${tribeId} and user_id=${applicantId} returning tribe_id`)).rows.length },
        { name: "account", update: async (transaction) => (await transaction.execute(sql`update public."user" set "updatedAt"="updatedAt" where id=${applicantId} returning id`)).rows.length },
      ];
      for (const row of lockedRows) {
        const rowResult = await withAdmissionTransitionContention(database, fixture.own, async (transaction) => {
          await readLockedAdmissionFacts(transaction, tribeId, applicantId);
        }, () => database.withContext(fixture.own, row.update));
        expect(rowResult, row.name).toEqual({ status: "fulfilled", value: 1 });
      }
      await database.withContext(fixture.own, async (transaction) => {
        const instant = (await transaction.execute<{ now: string }>(sql`select clock_timestamp()::text as now`)).rows[0].now;
        await transaction.execute(sql`update public.academy_admission_policies set activated_at=${instant},version=version+1,updated_at=${instant} where tribe_id=${tribeId}`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${instant} where id=${tribeId}`);
        const dated = await readLockedAdmissionFacts(transaction, tribeId, applicantId);
        expect(dated.policy?.activatedAt).toBeInstanceOf(Date);
        expect(dated.policy?.activatedAt?.getTime()).toBe(Date.parse(instant));
        expect(dated.policy).toEqual(await readAdmissionPolicy(transaction, tribeId, false));
      });

      const restrictedRole = `admission_facts_${randomUUID().replaceAll("-", "")}`;
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql.raw(`create role "${restrictedRole}" nologin nobypassrls`));
        await transaction.execute(sql.raw(`grant "${restrictedRole}" to current_user`));
        await transaction.execute(sql.raw(`grant usage on schema public to "${restrictedRole}"`));
      });
      /** @param query - Actual native access attempted by the same restricted role. @returns Only bounded SQLSTATE metadata, never query parameters. */
      const restrictedAccess = async (query: (transaction: RequestDatabase) => Promise<unknown>) => database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql.raw(`set local role "${restrictedRole}"`));
        return query(transaction);
      }).then(() => [], (error: unknown) => readPostgresTestDiagnostics(error).sqlStates);
      expect(await restrictedAccess((transaction) => transaction.execute(sql`select tribe_id from public.tribe_academy_settings where tribe_id=${tribeId} for share`))).toContain(VALIDATION.permissionDeniedSqlState);
      expect(await restrictedAccess((transaction) => readLockedAdmissionFacts(transaction, tribeId, applicantId))).toContain(VALIDATION.permissionDeniedSqlState);
      const metadata = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ invoker: boolean; volatility: string }>(sql`select not prosecdef as invoker,provolatile as volatility from pg_proc where oid='public.read_locked_admission_facts(uuid,text)'::regprocedure`)).rows[0]);
      expect(metadata).toEqual({ invoker: true, volatility: "v" });
    }, { concurrentTransactions: VALIDATION.concurrentTransactions });
  }, VALIDATION.timeoutMs);
});
