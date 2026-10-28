/** @vitest-environment node */
/** Exercises the built native activity page and its real shared controls across engines. @module admission-email-settings-activity-browser-test */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionEmailSettings } from "@/tests/support/admission-notification-email-settings-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { ADMISSION_ACTIVITY_VALIDATION } from "@/tests/support/constants/admission-activity-validation";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native email settings activity UI", () => {
  // One owned database/server supplies immutable test facts; every view owns an isolated browser context.
  it("should show and filter the native email configuration audit in Chromium and WebKit at desktop and mobile widths", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionEmailSettings(database);
      expect(await fixture.repository.change(fixture.change, fixture.command(0, false, "Asia/Kolkata"))).toMatchObject({ state: "completed", result: { status: "changed", settings: { version: 1 } } });
      const identity = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ slug: string; token: string }>(sql`select tribe.slug,session.token from public.tribes tribe join public.session session on session.id=${fixture.read.sessionId} and session."userId"=${fixture.own.userId} where tribe.id=${fixture.read.tribeId}`)).rows[0]);
      const artifacts = process.env.ADMISSION_EMAIL_SETTINGS_ARTIFACT_ROOT;
      if (artifacts) await mkdir(artifacts, { recursive: true });
      const matrix: { engine: string; width: number; horizontalOverflow: boolean; pageErrors: number }[] = [];
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, identity.slug, async (origin, secret) => {
        for (const [engine, browserType] of [["chromium", chromium], ["webkit", webkit]] as const) {
          const browser = await browserType.launch({ headless: true });
          try {
            /** Verifies the activity audit and its filter in one isolated context at the given viewport width. */
            const verifyActivityView = async (width: number) => {
              const context = await browser.newContext({ viewport: { width, height: ADMISSION_ACTIVITY_VALIDATION.height } });
              try {
                await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${identity.token}.${await makeSignature(identity.token, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
                const page = await context.newPage(), errors: string[] = [];
                page.setDefaultTimeout(ADMISSION_ACTIVITY_VALIDATION.browserTimeoutMs);
                page.on("pageerror", () => errors.push("page_error"));
                page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/iu.test(message.text())) errors.push("hydration_error"); });
                await runPrivateBrowserRequest("open_email_activity", () => page.goto(`${origin}/${identity.slug}/academia/admissions/activity`, { waitUntil: "commit" }));
                const history = page.getByRole("region", { name: "Historial de actividad" });
                const summary = history.locator("summary").filter({ hasText: "Avisos por correo actualizados" });
                try { await summary.waitFor({ state: "visible" }); }
                catch (error) {
                  if (artifacts) {
                    const activity = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select pid,state,wait_event_type,wait_event,round(extract(epoch from clock_timestamp()-query_start))::integer as query_age_seconds,round(extract(epoch from clock_timestamp()-xact_start))::integer as transaction_age_seconds,pg_blocking_pids(pid) as blocking_pids,md5(query) as statement_digest from pg_stat_activity where datname=current_database() and backend_type='client backend' and pid<>pg_backend_pid() order by query_start`)).rows);
                    const privateValues = [fixture.own.userId, fixture.read.tribeId, fixture.read.sessionId, identity.slug, identity.token, secret];
                    const mainText = await page.locator("main").innerText({ timeout: 1000 }).catch(() => "main_unavailable");
                    const safeText = privateValues.reduce((text, value) => text.replaceAll(value, "[synthetic]"), mainText).slice(0, 5000);
                    const snapshotStatus = await runPrivateBrowserRequest("diagnose_email_activity", () => context.request.get(`${origin}/api/tribes/${identity.slug}/admissions/activity/snapshot`, { timeout: 5000 })).then((response) => response.status(), () => null);
                    await writeFile(join(artifacts, "failure.json"), JSON.stringify({ engine, width, snapshotStatus, path: new URL(page.url()).pathname.replaceAll(identity.slug, "[synthetic]"), mainText: safeText, pageErrors: errors, activity }, null, 2));
                    await page.screenshot({ path: join(artifacts, "failure.png"), fullPage: true });
                  }
                  throw error;
                }
                await summary.click();
                await history.getByText("Correo externo habilitado", { exact: true }).waitFor({ state: "visible" });
                await history.getByText("Zona horaria", { exact: true }).waitFor({ state: "visible" });
                await history.getByText("Asia/Kolkata", { exact: true }).waitFor({ state: "visible" });
                await page.getByRole("combobox", { name: "Tipo de recurso" }).click();
                await page.getByRole("option", { name: "Avisos por correo", exact: true }).click();
                const filtered = page.waitForResponse((response) => { const url = new URL(response.url()); return url.pathname.endsWith("/admissions/activity/snapshot") && url.searchParams.get("resourceType") === "admission_email_settings"; });
                await page.getByRole("button", { name: "Aplicar filtros" }).click();
                expect((await filtered).status()).toBe(200);
                expect(await page.getByRole("combobox", { name: "Tipo de recurso" }).innerText()).toBe("Avisos por correo");
                await history.locator("summary").filter({ hasText: "Avisos por correo actualizados" }).waitFor({ state: "visible" });
                const detail = history.locator("details").filter({ hasText: "Avisos por correo actualizados" });
                if (!await detail.evaluate((element) => element.hasAttribute("open"))) await detail.locator("summary").click();
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
                expect(overflow).toBe(false);
                expect(errors).toEqual([]);
                if (artifacts) await history.screenshot({ path: join(artifacts, `${engine}-${width}.png`) });
                if (engine === "chromium" && width === 1280) await captureAdmissionReview(page, "admission-email-settings-history", [fixture.own.userId, fixture.read.tribeId, fixture.read.sessionId, identity.token, secret], "email-settings-history-captures.json", { selector: 'section[class*="AdmissionActivity"]', omit: "details dl > div:nth-child(1), details dl > div:nth-child(2), details dl > div:nth-child(4), details dl > div:nth-child(8), details dl > div:nth-child(9)" });
                matrix.push({ engine, width, horizontalOverflow: overflow, pageErrors: errors.length });
              } finally { await context.close(); }
            };
            for (const width of [1280, 390]) await verifyActivityView(width);
          } finally { await browser.close(); }
        }
      }));
      expect(matrix).toHaveLength(4);
      if (artifacts) await writeFile(join(artifacts, "matrix.json"), JSON.stringify(matrix, null, 2));
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
