/** @vitest-environment node */
/** Exercises the built common original-operation endpoint with native cookies and no fresh Google confirmation. @module admission-email-settings-recovery-native-http-tests */
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

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native readonly email settings recovery HTTP", () => {
  it("should return original minimal settings through the existing route without another confirmation or write", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionEmailSettings(database), original = fixture.command(0, false, "Asia/Kolkata");
      expect(await fixture.repository.change(fixture.change, original)).toMatchObject({ state: "completed", result: { status: "changed", settings: { version: 1 } } });
      expect(await fixture.repository.change(fixture.change, fixture.command(1, false, "UTC"))).toMatchObject({ state: "completed", result: { status: "changed", settings: { version: 2 } } });
      const identity = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ slug: string; token: string }>(sql`select tribe.slug,session.token from public.tribes tribe join public.session session on session.id=${fixture.read.sessionId} and session."userId"=${fixture.own.userId} where tribe.id=${fixture.read.tribeId}`)).rows[0]);
      const baseline = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as operations,sum(version)::int as versions from public.academy_admission_operations where tribe_id=${fixture.read.tribeId}`)).rows[0]);

      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, identity.slug, async (origin, secret) => {
        const cookie = encodeURIComponent(`${identity.token}.${await makeSignature(identity.token, secret)}`);
        const client = await playwrightRequest.newContext({ baseURL: origin, timeout: ADMISSION_ACTIVITY_VALIDATION.browserTimeoutMs, extraHTTPHeaders: { cookie: `better-auth.session_token=${cookie}`, origin } });
        try {
          const prefix = `/api/tribes/${identity.slug}/admissions`;
          const response = await runPrivateBrowserRequest("read_original_email_settings", () => client.get(`${prefix}/operations/${original.operationId}`));
          expect(response.status()).toBe(200);
          expect(await response.json()).toEqual({ type: "update_admission_email_settings", state: "completed", operationId: original.operationId, replayed: true, result: { status: "changed", settings: { enabled: false, version: 1, timeZone: "Asia/Kolkata" } } });
          expect(response.headers()["cache-control"]).toBe("no-store");
          expect(response.headers()["referrer-policy"]).toBe("no-referrer");
          const current = await runPrivateBrowserRequest("read_current_settings_after_original", () => client.get(`${prefix}/email-settings`));
          expect(current.status()).toBe(200);
          expect(await current.json()).toEqual({ settings: { enabled: false, version: 2, timeZone: "UTC" }, platformRequirement: null });
          await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.read.sessionId}`));
          const mutation = await runPrivateBrowserRequest("deny_email_change_after_session_expiry", () => client.post(`${prefix}/email-settings`, { data: fixture.command(2, true) }));
          expect(mutation.status()).toBe(401);
          expect(await mutation.json()).toMatchObject({ code: "authentication_required" });
        } finally { await client.dispose(); }
      }));

      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as operations,sum(version)::int as versions from public.academy_admission_operations where tribe_id=${fixture.read.tribeId}`)).rows[0])).toEqual(baseline);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,time_zone from public.admission_email_settings where tribe_id=${fixture.read.tribeId}`)).rows[0])).toEqual({ version: 2, time_zone: "UTC" });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
