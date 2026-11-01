/** @vitest-environment node */
/** Exercises authorized mode exit and physical deletion through the real owners and original recovery. @module tribe-lifecycle-owner-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { TRIBE_LIFECYCLE_AUDIT_MIGRATIONS } from "@/tests/support/constants/tribe-lifecycle-audit";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresTribeLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-lifecycle-repository";
import { ManageTribeLifecycleUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-lifecycle-use-cases";
import { createAdmissionScopeClosureWriter } from "@/src/modules/academy-admissions/setup";
import type { TribeLifecycleContext } from "@/src/modules/tribes/domain/repositories/tribe-lifecycle-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native tribe lifecycle owner", () => {
  it("should change with the live leader session, close scope on exit and recover a committed deletion without using a surviving tribe", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database);
      for (const migration of TRIBE_LIFECYCLE_AUDIT_MIGRATIONS) await database.applyMigration(migration);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const applicant = await createApplicant(), pending = await applicant.commands.submit.execute({ ...applicant.input, expectedPolicyVersion: 3 });
      if (!pending.ok) throw new Error(`Tribe lifecycle pending setup failed: ${pending.failure.code}`, { cause: pending.failure.cause });
      expect(pending).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending" } } });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      let loseResponse = false;
      const execute = async <Result>(_context: TribeLifecycleContext, run: (transaction: RequestDatabase) => Promise<Result>) => {
        const result = await database.withContext(fixture.own, run);
        if (loseResponse && typeof result === "object" && result !== null && "state" in result && result.state === "completed") { loseResponse = false; throw new Error("Synthetic tribe lifecycle reply lost after commit"); }
        return result;
      };
      const lifecycle = new ManageTribeLifecycleUseCases(accounts, new PostgresTribeLifecycleRepository(execute, async () => fixture.config, createAdmissionScopeClosureWriter));
      const settings = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{config_version: number}>(sql`select config_version from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`)).rows[0]);
      const exit = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), action: "exit_academy" as const, expectedConfigVersion: settings.config_version, confirmed: true };
      const exited = await lifecycle.change(exit);
      expect(exited).toMatchObject({ state: "completed", replayed: false, result: { action: "exit_academy", deleted: false, accessModel: "legacy", configVersion: settings.config_version + 1 } });
      await expect(lifecycle.change(exit)).resolves.toMatchObject({ state: "completed", replayed: true });
      await expect(lifecycle.recover(exit)).resolves.toMatchObject({ state: "completed", replayed: true });
      await expect(lifecycle.change({ ...exit, expectedConfigVersion: settings.config_version + 1 })).rejects.toMatchObject({ code: "idempotency_conflict" });
      const closed = await database.withContext(fixture.own, async (transaction) => ({
        requests: (await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows,
        marker: (await transaction.execute<{protected: boolean}>(sql`select admissions_control_activated_at is not null as protected from public.tribes where id=${fixture.tribeId}`)).rows[0].protected,
        members: (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public.tribe_members where tribe_id=${fixture.tribeId}`)).rows[0].count,
      }));
      expect(closed).toEqual({ requests: [{ status: "cancelled", cancel_reason: "academy_unavailable" }], marker: true, members: 1 });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select audit.actor_user_id,audit.operation_id,audit.tribe_lifecycle_operation_id,operation.action from public.academy_admission_audit_events audit join public.tribe_lifecycle_operations operation on operation.tribe_id=audit.tribe_id and operation.operation_id=audit.tribe_lifecycle_operation_id where audit.tribe_id=${fixture.tribeId} and audit.resource_type='admission_request' and audit.event_type='cancelled'`)).rows).toEqual([{ actor_user_id: null, operation_id: null, tribe_lifecycle_operation_id: exit.operationId, action: "exit_academy" }]);
      });
      const deletion = { ...exit, operationId: randomUUID(), action: "delete_tribe" as const, expectedConfigVersion: settings.config_version + 1 };
      loseResponse = true;
      const deleted = await lifecycle.change(deletion).catch((error: unknown) => {
        const diagnostics: string[] = [];
        let current: unknown = error;
        while (current && typeof current === "object") {
          if ("code" in current && typeof current.code === "string") diagnostics.push(current.code);
          if ("message" in current && typeof current.message === "string") {
            const missingColumn = /column "([a-z_]+)" .*exist/.exec(current.message);
            if (missingColumn) diagnostics.push(`missing_column_${missingColumn[1]}`);
          }
          current = "cause" in current ? current.cause : null;
        }
        throw new Error(`Native tribe deletion failed: ${diagnostics.join("/")}`, { cause: error });
      });
      expect(deleted).toMatchObject({ state: "completed", replayed: true, result: { action: "delete_tribe", deleted: true, accessModel: null, configVersion: null } });
      await expect(lifecycle.recover(deletion)).resolves.toMatchObject({ state: "completed", replayed: true });
      await expect(lifecycle.change(deletion)).resolves.toMatchObject({ state: "completed", replayed: true });
      const retired = await database.withContext(fixture.own, async (transaction) => ({
        live: (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public.tribes where id=${fixture.tribeId}`)).rows[0].count,
        retired: (await transaction.execute<{retired: boolean}>(sql`select retired_at is not null as retired from public.academy_admission_tribe_namespaces where tribe_id=${fixture.tribeId}`)).rows[0].retired,
        originals: (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public.tribe_lifecycle_operations where tribe_id=${fixture.tribeId} and actor_user_id=${fixture.userId}`)).rows[0].count,
        archivedSubmission: (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public.academy_admission_retired_operations where tribe_id=${fixture.tribeId} and idempotency_key=${applicant.input.operationId}`)).rows[0].count,
        actor: (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public."user" where id=${fixture.userId}`)).rows[0].count,
      }));
      expect(retired).toEqual({ live: 0, retired: true, originals: 2, archivedSubmission: 1, actor: 1 });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select tribe_lifecycle_operation_id,operation_id,actor_reference_id from public.academy_admission_retired_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_request' and event_type='cancelled'`)).rows).toEqual([{ tribe_lifecycle_operation_id: exit.operationId, operation_id: null, actor_reference_id: null }]);
      });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${fixture.tribeId},'Synthetic prohibited reuse',${`reuse-${fixture.tribeId}`},${fixture.userId})`))).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should keep a resent committed change unresolved while the platform security is down, and reject only a new change definitively", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture } = await prepareAllowlistAdmission(database);
      for (const migration of TRIBE_LIFECYCLE_AUDIT_MIGRATIONS) await database.applyMigration(migration);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const execute = <Result>(_context: TribeLifecycleContext, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(fixture.own, run);
      const lifecycle = (readSecurityConfig: () => Promise<MessagingSecurityConfig>) => new ManageTribeLifecycleUseCases(accounts, new PostgresTribeLifecycleRepository(execute, readSecurityConfig, createAdmissionScopeClosureWriter));
      const protectedLifecycle = lifecycle(async () => fixture.config), unprotected = lifecycle(() => readMessagingHostingSecurityConfig({})), locked = lifecycle(async () => ({ ...fixture.config, recoveryLocked: true }));
      const state = () => database.withContext(fixture.own, async (transaction) => ({
        settings: (await transaction.execute<{access_model: string; config_version: number}>(sql`select access_model,config_version from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`)).rows[0],
        originals: (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public.tribe_lifecycle_operations where tribe_id=${fixture.tribeId}`)).rows[0].count,
      }));
      const before = await state();
      const exit = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), action: "exit_academy" as const, expectedConfigVersion: before.settings.config_version, confirmed: true };
      await expect(protectedLifecycle.change(exit)).resolves.toMatchObject({ state: "completed", replayed: false });
      // The commit response was lost and the same POST is resent after the hosting security became unusable.
      for (const current of [unprotected, locked]) await expect(current.change(exit)).rejects.toMatchObject({ code: "operation_unresolved", operationId: exit.operationId });
      const deletion = { ...exit, operationId: randomUUID(), action: "delete_tribe" as const, expectedConfigVersion: before.settings.config_version + 1 };
      for (const current of [unprotected, locked]) await expect(current.change(deletion)).rejects.toMatchObject({ code: "platform_security_unavailable", operationId: undefined });
      expect(await state()).toEqual({ settings: { access_model: "legacy", config_version: before.settings.config_version + 1 }, originals: 1 });
      await expect(protectedLifecycle.change(exit)).resolves.toMatchObject({ state: "completed", replayed: true });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
