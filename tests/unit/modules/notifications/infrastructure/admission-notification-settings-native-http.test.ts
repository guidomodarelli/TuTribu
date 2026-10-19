/** @vitest-environment node */
/** Exercises the actual built App Router endpoints with native Better Auth cookies and real PostgreSQL. @module admission-notification-settings-native-http-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { request as playwrightRequest } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionEmailSettings } from "@/tests/support/admission-notification-email-settings-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { ADMISSION_ACTIVITY_VALIDATION } from "@/tests/support/constants/admission-activity-validation";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native notification settings HTTP routes", () => {
  it("should serve and mutate own preferences through real endpoints while keeping sensitive email changes closed without their exact confirmation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange only synthetic current identity and native prerequisite metadata; no provider is called.
      const fixture = await prepareAdmissionEmailSettings(database);
      const identity = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ slug: string; token: string }>(sql`select tribe.slug,session.token from public.tribes tribe join public.session session on session.id=${fixture.read.sessionId} and session."userId"=${fixture.own.userId} where tribe.id=${fixture.read.tribeId}`)).rows[0]);

      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, identity.slug, async (origin, secret) => {
        const cookie = encodeURIComponent(`${identity.token}.${await makeSignature(identity.token, secret)}`);
        const client = await playwrightRequest.newContext({ baseURL: origin, timeout: ADMISSION_ACTIVITY_VALIDATION.browserTimeoutMs, extraHTTPHeaders: { cookie: `better-auth.session_token=${cookie}`, origin } });
        try {
          const prefix = `/api/tribes/${identity.slug}/admissions`;
          const own = await runPrivateBrowserRequest("read_own_admission_preference", () => client.get(`${prefix}/notification-preferences`));
          expect(own.status()).toBe(200);
          expect(await own.json()).toEqual({ preference: { mode: "grouped", version: 0, source: "implicit" }, canConfigureEmail: true });
          expect(own.headers()["cache-control"]).toBe("no-store");
          expect(own.headers()["referrer-policy"]).toBe("no-referrer");

          const saved = await runPrivateBrowserRequest("change_own_admission_preference", () => client.patch(`${prefix}/notification-preferences`, { data: { mode: "daily", expectedVersion: 0 } }));
          expect(saved.status()).toBe(200);
          expect(await saved.json()).toEqual({ status: "changed", preference: { mode: "daily", version: 1, source: "stored" } });
          const current = await runPrivateBrowserRequest("read_current_admission_preference", () => client.get(`${prefix}/notification-preferences`));
          expect(await current.json()).toEqual({ preference: { mode: "daily", version: 1, source: "stored" }, canConfigureEmail: true });
          const conflict = await runPrivateBrowserRequest("reject_stale_admission_preference", () => client.patch(`${prefix}/notification-preferences`, { data: { mode: "individual", expectedVersion: 0 } }));
          expect(await conflict.json()).toEqual({ status: "rejected", reason: "notification_preference_version_conflict" });

          const settings = await runPrivateBrowserRequest("read_current_admission_email_settings", () => client.get(`${prefix}/email-settings`));
          expect(settings.status()).toBe(200);
          expect(await settings.json()).toEqual({ enabled: false, version: 0, timeZone: "America/Argentina/Buenos_Aires" });
          await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.read.sessionId}`));
          const expiredSession = await runPrivateBrowserRequest("deny_admission_email_change_after_session_expiry", () => client.post(`${prefix}/email-settings`, { data: fixture.command(0, false, "UTC") }));
          expect(expiredSession.status()).toBe(401);
          expect(await expiredSession.json()).toMatchObject({ code: "authentication_required" });
          await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '1 hour' where id=${fixture.read.sessionId}`));
          const spoofed = await runPrivateBrowserRequest("reject_admission_preference_identity_claim", () => client.patch(`${prefix}/notification-preferences`, { data: { mode: "daily", expectedVersion: 1, userId: randomUUID() } }));
          expect(spoofed.status()).toBe(400);
          const foreignOrigin = await runPrivateBrowserRequest("deny_foreign_admission_preference_origin", () => client.patch(`${prefix}/notification-preferences`, { headers: { origin: "https://foreign.example.invalid" }, data: { mode: "daily", expectedVersion: 1 } }));
          expect(foreignOrigin.status()).toBe(403);
        } finally { await client.dispose(); }
      }));

      // Assert real effects after the server has exited, without publishing account/cookie/connection values.
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select mode,version from public.admission_notification_preferences where tribe_id=${fixture.read.tribeId} and recipient_user_id=${fixture.own.userId}`)).rows)).toEqual([{ mode: "daily", version: 1 }]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.admission_email_settings where tribe_id=${fixture.read.tribeId}) as settings,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.read.tribeId}) as deliveries`)).rows[0])).toEqual({ settings: 0, deliveries: 0 });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
