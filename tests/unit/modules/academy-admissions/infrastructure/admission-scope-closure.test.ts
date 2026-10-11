/** @vitest-environment node */
/** Exercises authoritative scope retirement through the actual academy settings owner row. @module admission-scope-closure-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareTribeMembershipLifecycle } from "@/tests/support/tribe-membership-lifecycle-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native academy scope closure", () => {
  it.each(["mode_exit", "settings_delete"] as const)("should close pending and unused authority after %s while pause and return preserve their distinct rules", async (action) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareTribeMembershipLifecycle(database), invitationId = randomUUID();
      await database.applyMigration("20261011223000_close_admission_scope_lifecycle.sql");
      const own = { userId: fixture.leader.userId, email: fixture.leader.email };
      await database.withContext(own, async (transaction) => {
        await transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,contact_type,normalized_contact,internal_name,requires_allowlist,contact_fingerprint,fingerprint_key_id,created_by_user_id,expires_at,token_hash,token_key_id) values (${invitationId},${fixture.tribeId},'email','unused@example.test','Unused synthetic invitation',false,${randomBytes(32)},'synthetic-contact-key',${fixture.leader.userId},clock_timestamp()+interval '7 days',${randomBytes(32)},'synthetic-scope-token')`);
      });
      await database.withContext(own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.tribeId} for update`);
        await transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=false where tribe_id=${fixture.tribeId}`);
        expect((await transaction.execute(sql`select status from public.academy_admission_requests where id=${fixture.requestId}`)).rows).toEqual([{ status: "pending" }]);
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]);
      });
      await database.withContext(own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.tribeId} for update`);
        if (action === "mode_exit") await transaction.execute(sql`update public.tribe_academy_settings set access_model='legacy',admission_enabled=false where tribe_id=${fixture.tribeId}`);
        else await transaction.execute(sql`delete from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`);
      });
      const retired = await database.withContext(own, async (transaction) => ({
        request: (await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where id=${fixture.requestId}`)).rows[0],
        invitation: (await transaction.execute(sql`select status,version,revoked_at is not null as revoked from public.academy_personal_invitations where id=${invitationId}`)).rows[0],
        marker: (await transaction.execute<{protected: boolean}>(sql`select admissions_control_activated_at is not null as protected from public.tribes where id=${fixture.tribeId}`)).rows[0].protected,
      }));
      expect(retired).toEqual({ request: { status: "cancelled", cancel_reason: "academy_unavailable" }, invitation: { status: "revoked", version: 2, revoked: true }, marker: true });
      await database.withContext(own, async (transaction) => {
        if (action === "mode_exit") await transaction.execute(sql`update public.tribe_academy_settings set access_model='academy',admission_enabled=true where tribe_id=${fixture.tribeId}`);
        else await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.tribeId},'academy',true)`);
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "revoked", version: 2 }]);
        expect((await transaction.execute(sql`select status from public.academy_admission_requests where id=${fixture.requestId}`)).rows).toEqual([{ status: "cancelled" }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
