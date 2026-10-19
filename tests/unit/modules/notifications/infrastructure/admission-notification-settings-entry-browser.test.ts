/** @vitest-environment node */
/** Exercises the two implemented navigation entries and captures their real local controls. @module admission-notification-settings-entry-browser-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { chromium } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionEmailSettings } from "@/tests/support/admission-notification-email-settings-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { ADMISSION_ACTIVITY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-activity-validation";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native admission notification settings entry", () => {
  it("should reach own settings from the review and policy pages without writing email settings or queuing messages", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-notification-settings-entry", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionEmailSettings(database, config), tribeId = fixture.read.tribeId, slug = `email-settings-${tribeId}`;
      const token = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ token: string }>(sql`select token from public.session where id=${fixture.read.sessionId}`)).rows[0].token);
      const artifacts = process.env.ADMISSION_NOTIFICATION_SETTINGS_ARTIFACT_ROOT ?? join(process.cwd(), "test-results", "admission-notification-settings-entry");
      await mkdir(artifacts, { recursive: true });
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browser = await chromium.launch({ headless: true });
        try {
          const context = await browser.newContext({ viewport: { width: 1280, height: VALIDATION.height }, reducedMotion: "reduce" });
          try {
            const cookie = encodeURIComponent(`${token}.${await makeSignature(token, secret)}`);
            await runPrivateBrowserRequest("bind_notification_entry_cookie", () => context.addCookies([{ name: "better-auth.session_token", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" }]));
            const page = await context.newPage(); page.setDefaultTimeout(VALIDATION.browserTimeoutMs);
            const forbidden = [secret, token, fixture.own.userId, fixture.own.email, fixture.read.sessionId, tribeId];
            const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.name));
            const entries = [{ segment: "academia/admissions", capture: "notification-settings-entry" }, { segment: "academia/admissions/settings", capture: "notification-settings-policy-entry" }];
            for (const entry of entries) {
              await page.goto(`${origin}/${slug}/${entry.segment}`, { waitUntil: "domcontentloaded" });
              const navigation = page.getByRole("navigation", { name: "Secciones de admisión", exact: true });
              await navigation.getByRole("link", { name: "Avisos", exact: true }).waitFor();
              await captureAdmissionReview(page, entry.capture, forbidden, "notification-settings-entry-captures.json", { selector: 'nav[aria-label="Secciones de admisión"]' });
              await navigation.getByRole("link", { name: "Avisos", exact: true }).click();
              await page.waitForURL(`${origin}/${slug}/academia/admissions/notifications`);
              await page.getByRole("heading", { name: "Avisos de admisión", exact: true }).waitFor();
              await page.getByRole("form", { name: "Mi preferencia de correo", exact: true }).waitFor();
            }
            expect(errors).toEqual([]); expect(await fixture.repository.get(fixture.read)).toMatchObject({ enabled: false, version: 0 });
            const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as deliveries from public.message_deliveries where tribe_id=${tribeId}`)).rows[0]);
            expect(effects).toEqual({ deliveries: 0 });
            await writeFile(join(artifacts, "native-entry-proof.json"), JSON.stringify({ completedAt: new Date().toISOString(), reachedEntries: entries.map((entry) => entry.segment), captures: entries.map((entry) => entry.capture), settingsVersion: 0, errors, effects, externalMessagesSent: 0 }, null, 2));
          } finally { await context.close(); }
        } finally { await browser.close(); }
      }, { messagingSecurity }));
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
