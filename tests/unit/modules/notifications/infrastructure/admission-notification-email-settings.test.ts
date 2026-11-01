/** @vitest-environment node */
/** Exercises independent settings against real PostgreSQL, native identity, tested capability and the original ledger. @module admission-notification-email-settings-native-test */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionEmailSettings as prepareSettings } from "@/tests/support/admission-notification-email-settings-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { PostgresAdmissionNotificationEmailSettingsRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-email-settings-repository";
import { createAdmissionPlatformSecurityReader } from "@/src/modules/academy-admissions/infrastructure/composition/admission-platform-security";
import { mapAdmissionActivityStorage, type AdmissionActivityStorageRow } from "@/src/modules/academy-admissions/infrastructure/repositories/admission-activity-storage-mapper";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native independent admission email settings", { concurrent: true }, () => {
  // The actual selected tested email capability is independent of admission opening and OTP policy.
  it("should enable only tested selected email, retain precise cuts and never enable OTP or send a message", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareSettings(database);
      const originalCounts = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries) as deliveries,(select count(*)::int from public.academy_admission_policies) as policies`)).rows[0]);
      expect(await fixture.repository.get(fixture.read)).toEqual({ settings: { tribeId: fixture.change.tribeId, enabled: false, version: 0, enabledAtMicroseconds: null, timeZone: "America/Argentina/Buenos_Aires" }, platformRequirement: null });
      expect(await fixture.repository.change(fixture.change, fixture.command(0, true))).toMatchObject({ state: "completed", result: { status: "rejected", reason: "email_capability_unavailable" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as count from public.admission_email_settings where tribe_id=${fixture.change.tribeId}`)).rows[0])).toEqual({ count: 0 });
      await fixture.selectConnection();
      expect(await fixture.repository.change(fixture.change, fixture.command(0, true))).toMatchObject({ state: "completed", result: { status: "rejected", reason: "email_capability_unavailable" } });
      await fixture.prepareEmail();
      fixture.setRecoveryLocked(true);
      // The read names the platform requirement before the leader writes; the write registers nothing and is a definite rejection.
      expect(await fixture.repository.get(fixture.read)).toMatchObject({ settings: { enabled: false, version: 0 }, platformRequirement: "recovery_locked" });
      await expect(fixture.repository.change(fixture.change, fixture.command(0, true))).rejects.toMatchObject({ code: "platform_security_unavailable" });
      fixture.setRecoveryLocked(false);
      expect((await fixture.repository.get(fixture.read)).platformRequirement).toBeNull();
      const enabled = await fixture.repository.change(fixture.change, fixture.command(0, true));
      expect(enabled).toMatchObject({ state: "completed", result: { status: "changed", settings: { enabled: true, version: 1 } } });
      const first = (await fixture.repository.get(fixture.read)).settings;
      const native = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ exact: string; now: string }>(sql`select (extract(epoch from enabled_at)*1000000)::bigint::text as exact,(extract(epoch from clock_timestamp())*1000000)::bigint::text as now from public.admission_email_settings where tribe_id=${fixture.change.tribeId}`)).rows[0]);
      expect(first.enabledAtMicroseconds).toBe(Number(native.exact));
      expect(first.enabledAtMicroseconds).toBeLessThanOrEqual(Number(native.now));
      expect(await fixture.repository.change(fixture.change, fixture.command(1, true))).toMatchObject({ state: "completed", result: { status: "unchanged", settings: first } });
      const shifted = await fixture.repository.change(fixture.change, fixture.command(1, true, "Asia/Kolkata"));
      expect(shifted).toMatchObject({ state: "completed", result: { status: "changed", settings: { enabled: true, version: 2, timeZone: "Asia/Kolkata" } } });
      const second = (await fixture.repository.get(fixture.read)).settings;
      expect(second.enabledAtMicroseconds).toBeGreaterThan(first.enabledAtMicroseconds!);
      fixture.setCredentialAvailable(false);
      expect(await fixture.repository.change(fixture.change, fixture.command(2, false, "Asia/Kolkata"))).toMatchObject({ state: "completed", result: { status: "changed", settings: { enabled: false, version: 3, enabledAtMicroseconds: null } } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries) as deliveries,(select count(*)::int from public.academy_admission_policies) as policies`)).rows[0])).toEqual(originalCounts);
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  // A lost reply must recover the original confirmed outcome rather than turn historical enablement into current state.
  it("should reconcile a lost reply and preserve original replay, CAS, audit and owner isolation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareSettings(database);
      await fixture.selectConnection();
      await fixture.prepareEmail();
      const original = fixture.command(0, true);
      fixture.loseNextReply();
      const enabled = await fixture.repository.change(fixture.change, original);
      expect(enabled).toMatchObject({ state: "completed", result: { status: "changed", settings: { version: 1, enabled: true } } });
      expect(await fixture.repository.change(fixture.change, fixture.command(0, true))).toMatchObject({ state: "completed", result: { status: "rejected", reason: "email_settings_version_conflict" } });
      await fixture.repository.change(fixture.change, fixture.command(1, false));
      expect(await fixture.repository.change(fixture.change, original)).toMatchObject({ state: "completed", replayed: true, result: { status: "changed", settings: { version: 1, enabled: true } } });
      expect((await fixture.repository.get(fixture.read)).settings).toMatchObject({ enabled: false, version: 2, enabledAtMicroseconds: null });
      const audit = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select resource_version,metadata from public.academy_admission_audit_events where tribe_id=${fixture.change.tribeId} and resource_type='admission_email_settings' order by resource_version`)).rows);
      expect(audit).toEqual([
        { resource_version: 1, metadata: { previousVersion: null, enabled: true, timeZone: "America/Argentina/Buenos_Aires" } },
        { resource_version: 2, metadata: { previousVersion: 1, enabled: false, timeZone: "America/Argentina/Buenos_Aires" } },
      ]);
      const minimized = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select public.project_retired_admission_owner_metadata('admission_email_settings','admission_email_settings_changed',${JSON.stringify({ ...audit[0].metadata as object, secret: "must be discarded" })}::jsonb) as metadata`)).rows[0]);
      expect(minimized).toEqual({ metadata: audit[0].metadata });
      const visible = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<AdmissionActivityStorageRow>(sql`select * from public.read_academy_admission_activity(${fixture.change.tribeId},${fixture.change.sessionId},50,'admission_email_settings',null,null,null)`)).rows);
      expect(mapAdmissionActivityStorage(fixture.change.tribeId, visible, null).items).toHaveLength(2);
      await expect(fixture.repository.get({ ...fixture.read, userId: randomUUID() })).rejects.toMatchObject({ code: "permission_denied" });
      await database.grantTablesToNonBypass(["admission_email_settings"]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select tribe_id from public.admission_email_settings`)).rows, "non_bypass")).toEqual([]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.admission_email_settings(tribe_id) values (${randomUUID()})`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  // A native test trigger expires the actual session only after the genuine writer stages a change.
  it("should roll back staged settings and audit when the final native session guard fails", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareSettings(database);
      await fixture.repository.change(fixture.change, fixture.command(0, false, "Asia/Kolkata"));
      // Privileged direct writes still exercise the shipped artifact's zone/version/epoch invariants.
      for (const statement of [
        sql`update public.admission_email_settings set version=version+1 where tribe_id=${fixture.change.tribeId}`,
        sql`update public.admission_email_settings set time_zone='America/New_York' where tribe_id=${fixture.change.tribeId}`,
        sql`update public.admission_email_settings set time_zone='Not/A_Time_Zone',version=version+1 where tribe_id=${fixture.change.tribeId}`,
        sql`update public.admission_email_settings set enabled_at=clock_timestamp() where tribe_id=${fixture.change.tribeId}`,
      ]) await expect(database.withContext(fixture.own, (transaction) => transaction.execute(statement))).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`create function public.email_settings_test_expire_session() returns trigger language plpgsql as $$ begin update public.session set "expiresAt"=clock_timestamp() where "userId"=public.current_app_user_id(); return new; end; $$; create trigger email_settings_test_expire_session after update on public.admission_email_settings for each row execute function public.email_settings_test_expire_session()`));
      let staged: unknown = null;
      const guarded = new PostgresAdmissionNotificationEmailSettingsRepository((_context, run) => database.withContext(fixture.own, async (transaction) => {
        try { return await run(transaction); }
        catch (error) {
          staged = (await transaction.execute(sql`select settings.version,settings.time_zone,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.change.tribeId} and resource_type='admission_email_settings') as audits from public.admission_email_settings settings where tribe_id=${fixture.change.tribeId}`)).rows[0];
          throw error;
        }
      }), async () => fixture.config, createAdmissionPlatformSecurityReader(async () => fixture.config));
      await expect(guarded.change(fixture.change, fixture.command(1, false, "America/New_York"))).rejects.toMatchObject({ code: "authentication_required" });
      expect(staged).toEqual({ version: 2, time_zone: "America/New_York", audits: 2 });
      expect((await fixture.repository.get(fixture.read)).settings).toMatchObject({ version: 1, timeZone: "Asia/Kolkata", enabled: false });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as audits from public.academy_admission_audit_events where tribe_id=${fixture.change.tribeId} and resource_type='admission_email_settings'`)).rows[0])).toEqual({ audits: 1 });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
