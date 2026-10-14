/** @vitest-environment node */
/** Proves a deadline crossed inside real scope closure rolls back physical deletion and its original. @module tribe-lifecycle-recency-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { TRIBE_LIFECYCLE_AUDIT_MIGRATIONS } from "@/tests/support/constants/tribe-lifecycle-audit";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresTribeLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-lifecycle-repository";
import { ManageTribeLifecycleUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-lifecycle-use-cases";
import { createAdmissionScopeClosureWriter } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native lifecycle signed recency", () => {
  it("should roll back a staged retirement and physical deletion when signed evidence expires during the owner await", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database);
      for (const migration of TRIBE_LIFECYCLE_AUDIT_MIGRATIONS) await database.applyMigration(migration);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const applicant = await createApplicant();
      expect(await applicant.commands.submit.execute({ ...applicant.input, expectedPolicyVersion: 3 })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending" } } });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const settings = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{config_version: number}>(sql`select config_version from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`)).rows[0]);
      const authority = await database.withContext(fixture.own, async (transaction) => {
        const binding = (await transaction.execute<{account_id: string;provider_subject: string}>(sql`select account_id,provider_subject from public.global_session_identity_bindings where session_id=${fixture.sessionId} and user_id=${fixture.userId}`)).rows[0];
        const timing = (await transaction.execute<{now: Date;until: Date}>(sql`select clock_timestamp() as now,clock_timestamp()+interval '30 seconds' as until`)).rows[0];
        const intentId = randomUUID();
        await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${fixture.sessionId},${binding.account_id},${binding.provider_subject},${fixture.tribeId},${REAUTHENTICATION_OPERATION.deleteTribe},${fixture.tribeId},'/synthetic-lifecycle',${randomBytes(32)},'consumed',${timing.now},${timing.until},${timing.now})`);
        await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${binding.account_id},${binding.provider_subject},${fixture.sessionId},${fixture.tribeId},${REAUTHENTICATION_OPERATION.deleteTribe},${fixture.tribeId},${timing.now},${timing.now},${timing.until})`);
        return timing;
      });
      let scopeWasClosed = false;
      const writer = new PostgresTribeLifecycleRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, (transaction) => ({
        async close(event) {
          await createAdmissionScopeClosureWriter(transaction).close(event);
          scopeWasClosed = true;
          expect((await transaction.execute(sql`select count(*)::integer as total from public.tribe_lifecycle_operations where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 1 }]);
          expect((await transaction.execute(sql`select status from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows).toEqual([{ status: "cancelled" }]);
          // Observe the persisted deadline using real SQL time; no production clock is replaced.
          await transaction.execute(sql`select pg_sleep(greatest(0,extract(epoch from (${authority.until}::timestamptz-clock_timestamp()))+0.02))`);
        },
      }));
      const command = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), action: "delete_tribe" as const, expectedConfigVersion: settings.config_version, confirmed: true };
      const lifecycle = new ManageTribeLifecycleUseCases(accounts, writer);
      await expect(lifecycle.change(command)).rejects.toMatchObject({ code: "reauthentication_required" });
      expect(scopeWasClosed).toBe(true);
      await expect(lifecycle.recover(command)).resolves.toBeNull();
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as total from public.tribes where id=${fixture.tribeId}`)).rows).toEqual([{ total: 1 }]);
        expect((await transaction.execute(sql`select access_model,config_version from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ access_model: "academy", config_version: settings.config_version }]);
        expect((await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows).toEqual([{ status: "pending", cancel_reason: null }]);
        expect((await transaction.execute(sql`select retired_at is null as live from public.academy_admission_tribe_namespaces where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ live: true }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.tribe_lifecycle_operations where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and tribe_lifecycle_operation_id=${command.operationId}`)).rows).toEqual([{ total: 0 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
