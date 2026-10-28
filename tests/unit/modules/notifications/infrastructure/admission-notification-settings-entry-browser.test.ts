/** @vitest-environment node */
/** Exercises the two implemented navigation entries and captures their real local controls. @module admission-notification-settings-entry-browser-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { chromium, webkit } from "@playwright/test";
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

/** Width of the manual's captures; the mobile width is where the section row scrolls sideways. */
const ENTRY_CAPTURE_WIDTH = 1280;
const ENTRY_MOBILE_WIDTH = 390;
/** Chromium and WebKit, each at desktop and mobile width, share one server and one time budget per surface. */
const ENTRY_SURFACES = [chromium, webkit].flatMap((engine) => [ENTRY_CAPTURE_WIDTH, ENTRY_MOBILE_WIDTH].map((width) => ({ engine, width })));

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native admission notification settings entry", () => {
  it("should reach own settings from the review and policy pages without writing email settings or queuing messages in Chromium/WebKit at desktop/mobile widths", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-notification-settings-entry", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionEmailSettings(database, config), tribeId = fixture.read.tribeId, slug = `email-settings-${tribeId}`;
      const token = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ token: string }>(sql`select token from public.session where id=${fixture.read.sessionId}`)).rows[0].token);
      const artifacts = process.env.ADMISSION_NOTIFICATION_SETTINGS_ARTIFACT_ROOT ?? join(process.cwd(), "test-results", "admission-notification-settings-entry");
      await mkdir(artifacts, { recursive: true });
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        for (const { engine, width } of ENTRY_SURFACES) {
          process.stdout.write(`${JSON.stringify({ phase: "notification_entry_surface", engine: engine.name(), width })}\n`);
          // The manual keeps its Chromium 1280 captures; the other surfaces only prove the navigation.
          const capturesManual = engine === chromium && width === ENTRY_CAPTURE_WIDTH;
          const browser = await engine.launch({ headless: true });
          try {
            const context = await browser.newContext({ viewport: { width, height: VALIDATION.height }, reducedMotion: "reduce" });
            try {
              const cookie = encodeURIComponent(`${token}.${await makeSignature(token, secret)}`);
              await runPrivateBrowserRequest("bind_notification_entry_cookie", () => context.addCookies([{ name: "better-auth.session_token", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" }]));
              const page = await context.newPage(); page.setDefaultTimeout(VALIDATION.browserTimeoutMs);
              const forbidden = [secret, token, fixture.own.userId, fixture.own.email, fixture.read.sessionId, tribeId];
              const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.name));
              const entries = [{ segment: "academia/admissions", capture: "notification-settings-entry" }, { segment: "academia/admissions/settings", capture: "notification-settings-policy-entry" }];
              /** Reaches own notification settings from one admission page, capturing it for the manual when required. */
              const reachNotificationsFrom = async (entry: (typeof entries)[number]) => {
                await page.goto(`${origin}/${slug}/${entry.segment}`, { waitUntil: "domcontentloaded" });
                const navigation = page.getByRole("navigation", { name: "Secciones de admisión", exact: true });
                await navigation.getByRole("link", { name: "Avisos", exact: true }).waitFor();
                if (capturesManual) await captureAdmissionReview(page, entry.capture, forbidden, "notification-settings-entry-captures.json", { selector: 'nav[aria-label="Secciones de admisión"]' });
                // On a narrow screen the member swipes the row to reach «Avisos» before tapping it, often before the page hydrates.
                const notificationsLink = navigation.getByRole("link", { name: "Avisos", exact: true });
                await notificationsLink.evaluate((element) => element.scrollIntoView({ inline: "center", block: "nearest" }));
                await notificationsLink.click();
                await page.waitForURL(`${origin}/${slug}/academia/admissions/notifications`);
                await page.getByRole("heading", { name: "Avisos de admisión", exact: true }).waitFor();
                await page.getByRole("form", { name: "Configurar avisos de admisión", exact: true }).waitFor();
              };
              for (const entry of entries) await reachNotificationsFrom(entry);
              expect(errors).toEqual([]); expect(await fixture.repository.get(fixture.read)).toMatchObject({ enabled: false, version: 0 });
              const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as deliveries from public.message_deliveries where tribe_id=${tribeId}`)).rows[0]);
              expect(effects).toEqual({ deliveries: 0 });
              expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
              await writeFile(join(artifacts, `${engine.name()}-${width}-native-entry-proof.json`), JSON.stringify({ completedAt: new Date().toISOString(), reachedEntries: entries.map((entry) => entry.segment), captures: capturesManual ? entries.map((entry) => entry.capture) : [], settingsVersion: 0, errors, effects, externalMessagesSent: 0 }, null, 2));
            } finally { await context.close(); }
          } finally { await browser.close(); }
        }
      }, { messagingSecurity }));
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS * ENTRY_SURFACES.length);
});
