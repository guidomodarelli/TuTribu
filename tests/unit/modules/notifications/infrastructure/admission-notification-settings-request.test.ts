/** @vitest-environment node */
/** Exercises the native request factory and all four settings handlers against an owned real PostgreSQL branch. @module admission-notification-settings-request-native-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionEmailSettings } from "@/tests/support/admission-notification-email-settings-fixture";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { buildAdmissionNotificationSettingsModule } from "@/src/modules/notifications/setup";
import { PostgresAuthenticatedAccountProvider, type CurrentGlobalSessionIdentity } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import type { AuthenticatedFeatureDependencies } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import { createAdmissionNotificationSettingsHandlers } from "@/src/modules/notifications/infrastructure/api/admission-notification-settings-handlers";
import { createAdmissionPlatformSecurityReader } from "@/src/modules/academy-admissions/infrastructure/composition/admission-platform-security";

/** @param database - Confirmed owned branch. @param fixture - Real synthetic prerequisite metadata. @param identity - Server-session selection only, never request body or authority facts. @returns Actual module composition with live SQL identity and a counter of the security reads made for email writes (the read of the platform requirement is composed apart). */
function compose(database: AcademyAdmissionTestDatabase, fixture: Awaited<ReturnType<typeof prepareAdmissionEmailSettings>>, identity: CurrentGlobalSessionIdentity) {
  const accounts = new PostgresAuthenticatedAccountProvider(async () => identity, (selected, run) => database.withContext({ userId: selected.userId, email: null }, run));
  const dependencies: AuthenticatedFeatureDependencies = { accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) };
  const admissions = buildAcademyAdmissionsModule(dependencies);
  const routing = admissions.createQueryModule({ executePublic: (run) => database.withContext({ userId: null, email: null }, run), readRecoveryLock: async () => fixture.config.recoveryLocked }).useCases;
  let securityReads = 0;
  const notifications = buildAdmissionNotificationSettingsModule(dependencies, { resolver: admissions.useCases.resolveContext, readSecurityConfig: async () => { securityReads++; return fixture.config; }, readPlatformSecurity: createAdmissionPlatformSecurityReader(async () => fixture.config) });
  return { handlers: createAdmissionNotificationSettingsHandlers(async () => ({ resolveTribe: routing.resolveTribe, ...notifications.useCases })), securityReads: () => securityReads };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification settings request", () => {
  it("should bind preferences and original email operations to actual current sessions without sending or enabling OTP", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange native synthetic prerequisites under the complete original journal and all guards.
      const fixture = await prepareAdmissionEmailSettings(database);
      const tribeId = fixture.read.tribeId;
      const slug = `email-settings-${tribeId}`;
      const context = { params: Promise.resolve({ slug }) };
      const leader = compose(database, fixture, { userId: fixture.own.userId, sessionId: fixture.read.sessionId });
      const request = (body?: unknown) => new Request(`https://app.example.test/api/tribes/${slug}/admissions/notification-preferences`, { method: body === undefined ? "GET" : "POST", headers: { origin: "https://app.example.test", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const baseline = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.academy_admission_policies where tribe_id=${tribeId}) as policies`)).rows[0]);

      // Read defaults without creating settings or touching the current security keyring.
      const own = await leader.handlers.readOwnPreference(request(), context);
      expect(own.status).toBe(200);
      expect(await own.json()).toEqual({ preference: { mode: "grouped", version: 0, source: "implicit" }, canConfigureEmail: true });
      const settings = await leader.handlers.readEmailSettings(request(), context);
      expect(settings.status).toBe(200);
      expect(await settings.json()).toEqual({ settings: { enabled: false, version: 0, timeZone: "America/Argentina/Buenos_Aires" }, platformRequirement: null });
      expect(leader.securityReads()).toBe(0);

      // A guardian has independent own preferences and no authority over the leader's email settings.
      const guardianId = randomUUID(), guardianSessionId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${guardianId},'Synthetic settings guardian',${`${guardianId}@example.invalid`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${guardianSessionId},${guardianId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${guardianId},'guardian','active')`);
      });
      const guardian = compose(database, fixture, { userId: guardianId, sessionId: guardianSessionId });
      const guardianDefault = await guardian.handlers.readOwnPreference(request(), context);
      expect(guardianDefault.status).toBe(200);
      expect(await guardianDefault.json()).toEqual({ preference: { mode: "omitted", version: 0, source: "implicit" }, canConfigureEmail: false });
      const choice = await guardian.handlers.changeOwnPreference(request({ mode: "daily", expectedVersion: 0 }), context);
      expect(choice.status).toBe(200);
      expect(await choice.json()).toEqual({ status: "changed", preference: { mode: "daily", version: 1, source: "stored" } });
      expect(await (await guardian.handlers.changeOwnPreference(request({ mode: "individual", expectedVersion: 0 }), context)).json()).toEqual({ status: "rejected", reason: "notification_preference_version_conflict" });
      expect((await guardian.handlers.readEmailSettings(request(), context)).status).toBe(403);
      expect((await guardian.handlers.changeEmailSettings(request(fixture.command(0, true)), context)).status).toBe(403);
      expect((await guardian.handlers.changeOwnPreference(request({ mode: "daily", expectedVersion: 1, userId: fixture.own.userId }), context)).status).toBe(400);
      expect(guardian.securityReads()).toBe(0);
      expect(await (await leader.handlers.readOwnPreference(request(), context)).json()).toMatchObject({ preference: { mode: "grouped", version: 0, source: "implicit" } });

      // A rejected original remains rejected after readiness changes; a new explicit UUID can enable email.
      const unavailable = fixture.command(0, true);
      expect(await (await leader.handlers.changeEmailSettings(request(unavailable), context)).json()).toMatchObject({ state: "completed", operationId: unavailable.operationId, result: { status: "rejected", reason: "email_capability_unavailable" } });
      await fixture.selectConnection();
      await fixture.prepareEmail();
      const enabled = fixture.command(0, true, "Asia/Kolkata");
      const saved = await leader.handlers.changeEmailSettings(request(enabled), context);
      expect(saved.status).toBe(200);
      expect(await saved.json()).toEqual({ state: "completed", operationId: enabled.operationId, replayed: false, result: { status: "changed", settings: { enabled: true, version: 1, timeZone: "Asia/Kolkata" } } });
      const replay = await leader.handlers.changeEmailSettings(request(enabled), context);
      expect(await replay.json()).toEqual({ state: "completed", operationId: enabled.operationId, replayed: true, result: { status: "changed", settings: { enabled: true, version: 1, timeZone: "Asia/Kolkata" } } });
      expect(await (await leader.handlers.changeEmailSettings(request(unavailable), context)).json()).toMatchObject({ state: "completed", operationId: unavailable.operationId, replayed: true, result: { status: "rejected", reason: "email_capability_unavailable" } });
      expect(await (await leader.handlers.readEmailSettings(request(), context)).json()).toEqual({ settings: { enabled: true, version: 1, timeZone: "Asia/Kolkata" }, platformRequirement: null });

      // Current SQL role/session loss closes both APIs; historical data cannot become a browser permission.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='muted' where tribe_id=${tribeId} and user_id=${guardianId}`));
      expect((await guardian.handlers.readOwnPreference(request(), context)).status).toBe(403);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.read.sessionId}`));
      expect((await leader.handlers.readOwnPreference(request(), context)).status).toBe(401);
      expect((await leader.handlers.readEmailSettings(request(), context)).status).toBe(401);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.academy_admission_policies where tribe_id=${tribeId}) as policies`)).rows[0])).toEqual(baseline);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select verification_daily_limit from public.messaging_usage_policies where tribe_id=${tribeId}`)).rows[0])).toEqual({ verification_daily_limit: 0 });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
