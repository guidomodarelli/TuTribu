/** @vitest-environment node */
/** Proves lifecycle changes need only the active canonical leader session and roll back when that session ends mid-closure. @module tribe-lifecycle-authorization-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { TRIBE_LIFECYCLE_AUDIT_MIGRATIONS } from "@/tests/support/constants/tribe-lifecycle-audit";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresTribeLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-lifecycle-repository";
import { ManageTribeLifecycleUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-lifecycle-use-cases";
import { createAdmissionScopeClosureWriter } from "@/src/modules/academy-admissions/setup";
import type { AdmissionScopeClosureWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-scope-closure-writer";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Wraps the real admission closure owner inside the lifecycle transaction. */
type ClosureDecorator = (transaction: RequestDatabase, real: AdmissionScopeClosureWriter) => AdmissionScopeClosureWriter;

/**
 * Seeds a live academy tribe with one pending applicant and its own lifecycle use cases.
 * @param database - Owned disposable branch.
 * @param decorate - Optional wrapper around the real admission scope closure.
 * @returns The fixture, a delete command bound to the current config version and the use cases.
 */
async function prepareLifecycle(database: AcademyAdmissionTestDatabase, decorate?: ClosureDecorator) {
  const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database);
  for (const migration of TRIBE_LIFECYCLE_AUDIT_MIGRATIONS) await database.applyMigration(migration);
  await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
  const applicant = await createApplicant();
  expect(await applicant.commands.submit.execute({ ...applicant.input, expectedPolicyVersion: 3 })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending" } } });
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
  const settings = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ config_version: number }>(sql`select config_version from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`)).rows[0]);
  const writer = new PostgresTribeLifecycleRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, (transaction) => {
    const real = createAdmissionScopeClosureWriter(transaction);
    return decorate ? decorate(transaction, real) : real;
  });
  const command = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), action: "delete_tribe" as const, expectedConfigVersion: settings.config_version, confirmed: true };
  return { fixture, applicant, settings, command, lifecycle: new ManageTribeLifecycleUseCases(accounts, writer) };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native lifecycle authorization", () => {
  it("should delete the tribe with the active leader session alone and replay the original", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, command, lifecycle } = await prepareLifecycle(database);
      expect(await lifecycle.change(command)).toMatchObject({ state: "completed", replayed: false, result: { action: "delete_tribe", deleted: true, accessModel: null, configVersion: null } });
      expect(await lifecycle.recover(command)).toMatchObject({ state: "completed", replayed: true, result: { deleted: true } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as total from public.tribes where id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should reject a member who is no longer the canonical leader or an unconfirmed change without changing the tribe", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, settings, command, lifecycle } = await prepareLifecycle(database);
      await expect(lifecycle.change({ ...command, confirmed: false })).rejects.toMatchObject({ code: "invalid_input" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await expect(lifecycle.change(command)).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select access_model,config_version from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ access_model: "academy", config_version: settings.config_version }]);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.tribe_lifecycle_operations where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should roll back a staged retirement and physical deletion when the session ends during the owner await", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const observed = { scopeWasClosed: false, sessionId: "" };
      const prepared = await prepareLifecycle(database, (transaction, real) => ({
        async close(event) {
          await real.close(event);
          observed.scopeWasClosed = true;
          expect((await transaction.execute(sql`select count(*)::integer as total from public.tribe_lifecycle_operations where tribe_id=${event.tribeId}`)).rows).toEqual([{ total: 1 }]);
          // End the live session inside the same transaction after the scope was staged; no production clock is replaced.
          await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${observed.sessionId}`);
        },
      }));
      const { fixture, applicant, settings, command, lifecycle } = prepared;
      observed.sessionId = fixture.sessionId;
      await expect(lifecycle.change(command)).rejects.toMatchObject({ code: "authentication_required" });
      expect(observed.scopeWasClosed).toBe(true);
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
