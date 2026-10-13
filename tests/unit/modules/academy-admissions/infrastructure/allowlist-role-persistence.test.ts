/** @vitest-environment node */
/** Exercises owner-backed configuration and request-role write denial under real non-bypass/FORCE RLS. @module allowlist-role-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAllowlistRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-repository";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native allowlist non-bypass role", () => {
  it("should block request-role configuration writes and retain owner authority checks under FORCE RLS", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      expect(database.nonBypassRole.bypassesRls).toBe(false);
      expect(database.nonBypassRole.isSuperuser).toBe(false);
      expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select relrowsecurity as enabled,relforcerowsecurity as forced from pg_class where oid='public.academy_allowlist_entries'::regclass`))).rows).toEqual([{ enabled: true, forced: true }]);
      const roleName = database.nonBypassRole.name.replaceAll('"', '""');
      // Grant only attempted DML privileges so the rejection proves RLS itself,
      // rather than merely failing on a missing table privilege.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql.raw(`grant select,insert,update on table public.academy_allowlist_entries,public.academy_admission_operations,public.academy_admission_audit_events to "${roleName}"`)));
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql.raw(`grant select,update on table public.tribes,public.tribe_academy_settings,public."user",public.session,public.account,public.global_session_identity_bindings,public.recent_authentication_evidence,public.academy_admission_policies to "${roleName}"`)));
      // The existing tribe RLS policy reads invitation metadata while resolving its own member scope.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql.raw(`grant select on table public.tribe_members,public.tribe_invitations,public.global_identity_evidence to "${roleName}"`)));
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select has_table_privilege(current_user,'public.tribe_members','UPDATE') as membership_update`), "non_bypass")).rows).toEqual([{ membership_update: false }]);
      const writer = new PostgresAllowlistRepository((_context, run) => database.withContext(fixture.own, run, "non_bypass"), async () => fixture.config);
      const input = { context, operationId: randomUUID(), confirmed: true as const, contact: { type: "email" as const, value: "role@example.test" }, displayName: null };
      await expect(writer.create(input)).rejects.toMatchObject({ code: "unexpected_failure", cause: { cause: { code: "42501" } } });
      expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_admission_operations where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 0 }]);
      const original = await fixture.writer.create(input);
      expect(original).toMatchObject({ state: "completed", result: { version: 1, changed: true, created: true } });
      expect(await fixture.writer.create(input)).toEqual({ ...original, replayed: true });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await expect(fixture.writer.create(input)).rejects.toMatchObject({ code: "permission_denied" });
      expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 1 }]);
    });
  }, 600_000);
});
