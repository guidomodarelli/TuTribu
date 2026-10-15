/** @vitest-environment node */
/** Exercises the actual built page, same-origin read API and existing usage owner across engines. @module admission-activity-page-native-tests */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { chromium, webkit, type BrowserContext } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionActivityNative } from "@/tests/support/admission-activity-native-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { ADMISSION_ACTIVITY_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-activity-validation";
import { admissionActivityReadyPageStateSchema } from "@/src/modules/academy-admissions/constants/admission-activity-page-schemas";
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "@/src/modules/academy-admissions/constants/admission-audit";

/** Each browser/viewport owns its branch, server and sessions; bounded concurrent scheduling cannot share mutations. */
const scenarios = ([["chromium", chromium], ["webkit", webkit]] as const).flatMap(([engine, browserType]) => VALIDATION.widths.map((width) => ({ engine, browserType, width })));
describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native private activity page", () => {
  it.concurrent.each(scenarios)("should keep original history, current settings, UTC scope and role authority separate without keys or sends ($engine/$width)", async ({ engine, browserType, width }) => {
    let stage = "prepare_native_database";
    const matrix: { engine: string; width: number; currentVersion: number; historicalVersion: number }[] = [];
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        const prepared = await prepareAdmissionActivityNative(database, (phase) => { stage = phase; }), { fixture, usage, slug, guardian, foreignTribeId, foreignSlug } = prepared;
        const artifacts = process.env.ADMISSION_ACTIVITY_ARTIFACT_ROOT ?? join(process.cwd(), "user-guides/assets/academy-admissions");
        await mkdir(artifacts, { recursive: true });
        const configured = await usage.operations.read(usage.contexts.read);
        expect(configured).toMatchObject({ policy: { version: 2, verificationDailyLimit: VALIDATION.initialVerificationLimit, consumption: { verificationToday: 0, notificationToday: 0 } } });
        let version = 2, limit = VALIDATION.initialVerificationLimit;
        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
          /** @param context - Fresh browser identity boundary. @param token - Synthetic native session, held only in memory. @returns After signing through the real SDK. */
          const authenticate = async (context: BrowserContext, token: string) => context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${token}.${await makeSignature(token, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
            const browser = await browserType.launch({ headless: true });
            try {
                const context = await browser.newContext({ viewport: { width, height: VALIDATION.height } });
                try {
                  await authenticate(context, fixture.sessionToken);
                  const page = await context.newPage(), browserErrors: string[] = [];
                  page.setDefaultTimeout(VALIDATION.browserTimeoutMs);
                  page.on("pageerror", () => browserErrors.push("page_error"));
                  page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/iu.test(message.text())) browserErrors.push("hydration_error"); });
                  let snapshotRequests = 0;
                  page.on("request", (request) => { if (new URL(request.url()).pathname.endsWith("/admissions/activity/snapshot")) snapshotRequests += 1; });
                  stage = `${engine}_${width}_navigate_existing_usage`;
                  await runPrivateBrowserRequest("open_usage", () => page.goto(`${origin}/${slug}/academia/admissions/messaging`, { waitUntil: "commit" }));
                  await page.getByRole("spinbutton", { name: "Códigos por día" }).waitFor();
                  await page.getByRole("link", { name: "Ver consumo e historial" }).click();
                  await page.getByRole("button", { name: "Actualizar consumo e historial" }).waitFor();
                  expect(await page.getByRole("main").count()).toBe(1);
                  expect(snapshotRequests).toBe(0);
                  expect(await page.getByRole("main").innerText()).toContain(`Versión de uso observada: ${version}. Configuración actual: versión ${version}.`);
                  stage = `${engine}_${width}_native_api`;
                  const endpoint = `${origin}/api/tribes/${slug}/admissions/activity/snapshot`;
                  const startedAt = performance.now();
                  const response = await runPrivateBrowserRequest("read_snapshot", () => context.request.get(endpoint, { timeout: VALIDATION.browserTimeoutMs }));
                  process.stdout.write(JSON.stringify({ phase: "activity_native_snapshot", engine, width, durationMs: Math.ceil(performance.now() - startedAt), status: response.status() }) + "\n");
                  expect(response.status()).toBe(200);
                  expect(response.headers()["cache-control"]).toContain("no-store");
                  const body = admissionActivityReadyPageStateSchema.parse(await response.json());
                  expect(body).toMatchObject({ tribeId: fixture.tribeId, currentUsage: { policy: { version } }, metrics: { tribeId: fixture.tribeId, usage: { policyVersion: version, verificationToday: 0, notificationToday: 0 }, lastSuccessfulRun: null } });
                  expect(new Date(body.metrics.usage.dayStartUtc).getUTCHours()).toBe(0);
                  for (const privateValue of [fixture.own.email, guardian.email, fixture.sessionToken, secret, foreignTribeId]) expect(JSON.stringify(body)).not.toContain(privateValue);
                  const crossTenant = await runPrivateBrowserRequest("read_foreign_tenant", () => context.request.get(`${origin}/api/tribes/${foreignSlug}/admissions/activity/snapshot`, { timeout: VALIDATION.browserTimeoutMs }));
                  expect(crossTenant.status()).toBe(403);
                  expect(await crossTenant.json()).not.toHaveProperty("metrics");
                  stage = `${engine}_${width}_bounded_history`;
                  await runPrivateBrowserRequest("open_bounded_history", () => page.goto(`${origin}/${slug}/academia/admissions/activity?limit=1&resourceType=${ADMISSION_AUDIT_RESOURCE_TYPE.usagePolicy}`, { waitUntil: "commit" }));
                  await page.getByRole("button", { name: "Ver actividad anterior" }).waitFor();
                  const history = page.getByRole("region", { name: "Historial de actividad" });
                  expect(await history.locator("details").count()).toBe(1);
                  const reference = page.getByRole("textbox", { name: "Referencia del recurso (opcional)" });
                  await reference.fill("invalid-reference");
                  const beforeInvalid = snapshotRequests;
                  await page.getByRole("button", { name: "Aplicar filtros" }).click();
                  await page.getByRole("alert").filter({ hasText: "Revisá el tipo de recurso" }).waitFor();
                  expect(snapshotRequests).toBe(beforeInvalid);
                  if (engine === "chromium" && width === 1280) await captureAdmissionReview(page, "admission-activity-invalid-filter", [fixture.userId, fixture.sessionId, fixture.sessionToken, secret], VALIDATION.captureFile, { selector: 'section[class*="AdmissionActivity"]', omit: "details dl" });
                  await reference.fill(foreignTribeId);
                  // Next owns a separate route-announcer alert; only this form's stale validation must disappear.
                  await history.getByRole("alert").waitFor({ state: "hidden" });
                  expect(await history.getByRole("alert").count()).toBe(0);
                  await page.getByRole("button", { name: "Aplicar filtros" }).click();
                  await page.getByText("No hay eventos para los filtros aplicados.", { exact: true }).waitFor();
                  expect(await page.getByRole("region", { name: "Consumo del día UTC" }).innerText()).not.toContain(String(VALIDATION.foreignNotificationLimit));
                  await page.getByRole("textbox", { name: "Referencia del recurso (opcional)" }).fill("");
                  await page.getByRole("button", { name: "Aplicar filtros" }).click();
                  await page.getByRole("button", { name: "Ver actividad anterior" }).click();
                  await page.getByText("Inicio de países y cupos", { exact: true }).waitFor();
                  await history.locator("summary").click();
                  expect(await history.innerText()).toMatch(/Versión histórica\s+1/u);
                  expect(await history.innerText()).toMatch(/Operación original\s+[\da-f-]+/u);
                  expect(await history.innerText()).toContain(fixture.userId);
                  await history.locator("summary").click();
                  stage = `${engine}_${width}_new_configuration_does_not_rewrite_history`;
                  const oldVersion = version;
                  const changed = await usage.update(version, ++limit);
                  version += 1;
                  expect(changed).toMatchObject({ state: "completed", result: { version } });
                  expect(await page.getByRole("region", { name: "Consumo del día UTC" }).innerText()).toContain(`versión ${oldVersion}`);
                  await page.getByRole("button", { name: "Actualizar consumo e historial" }).click();
                  await page.getByText(`Versión de uso observada: ${version}. Configuración actual: versión ${version}.`, { exact: true }).waitFor();
                  await history.locator("summary").click();
                  expect(await history.innerText()).toMatch(/Versión histórica\s+1/u);
                  await history.locator("summary").click();
                  if (engine === "chromium" && width === 1280) {
                    await captureAdmissionReview(page, "admission-consumption-current", [fixture.userId, fixture.sessionId, fixture.sessionToken, secret], VALIDATION.captureFile, { selector: 'section[aria-label="Consumo del día UTC"]' });
                    await captureAdmissionReview(page, "admission-activity-history", [fixture.userId, fixture.sessionId, fixture.sessionToken, secret], VALIDATION.captureFile, { selector: 'section[class*="AdmissionActivity"]', omit: "details dl" });
                  }
                  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                  await page.screenshot({ path: join(artifacts, `${engine}-${width}-activity.png`), fullPage: true });
                  stage = `${engine}_${width}_activity_role_loss`;
                  await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
                  await page.getByRole("button", { name: "Actualizar consumo e historial" }).click();
                  await page.getByRole("button", { name: "Reintentar", exact: true }).waitFor();
                  expect(await page.getByRole("region", { name: "Consumo del día UTC" }).count()).toBe(0);
                  expect(await page.getByRole("region", { name: "Historial de actividad" }).count()).toBe(0);
                  if (engine === "chromium" && width === 1280) await captureAdmissionReview(page, "admission-activity-permission-loss", [fixture.userId, fixture.sessionId, fixture.sessionToken, secret], VALIDATION.captureFile, { selector: 'section[aria-label="Consumo e historial de admisión"]' });
                  await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
                  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
                  await page.getByRole("button", { name: "Actualizar consumo e historial" }).waitFor();
                  stage = `${engine}_${width}_increase_and_usage_role_loss`;
                  await page.getByRole("link", { name: "Volver a países y cupos" }).click();
                  const input = page.getByRole("spinbutton", { name: "Códigos por día" });
                  await input.waitFor();
                  expect(await input.inputValue()).toBe(String(limit));
                  await input.fill(String(limit + 1));
                  const confirmation = page.getByRole("checkbox", { name: /confirmo el aumento indicado/u });
                  await confirmation.waitFor();
                  expect(await confirmation.isChecked()).toBe(false);
                  expect(await page.getByRole("button", { name: "Guardar países y cupos" }).isDisabled()).toBe(true);
                  await confirmation.check();
                  expect(await page.getByRole("button", { name: "Guardar países y cupos" }).isEnabled()).toBe(true);
                  if (engine === "chromium" && width === 1280) await captureAdmissionReview(page, "messaging-usage-increase-impact", [fixture.userId, fixture.sessionId, fixture.sessionToken, secret], VALIDATION.captureFile, { selector: 'section[class*="MessagingUsage"]' });
                  await input.fill(String(limit + 2));
                  expect(await confirmation.isChecked()).toBe(false);
                  await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
                  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
                  await page.getByRole("button", { name: "Reintentar", exact: true }).waitFor();
                  expect(await page.getByRole("spinbutton", { name: "Códigos por día" }).count()).toBe(0);
                  await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
                  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
                  await page.getByRole("spinbutton", { name: "Códigos por día" }).waitFor();
                  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                  expect(browserErrors).toEqual([]);
                  matrix.push({ engine, width, currentVersion: version, historicalVersion: 1 });
                  process.stdout.write(JSON.stringify({ phase: "activity_browser_verified", engine, width }) + "\n");
                } finally { await context.close(); }
              stage = `${engine}_guardian_minimal_alert`;
              const guardianContext = await browser.newContext({ viewport: { width: 390, height: VALIDATION.height } });
              try {
                await authenticate(guardianContext, guardian.sessionToken);
                const response = await runPrivateBrowserRequest("guardian_snapshot", () => guardianContext.request.get(`${origin}/api/tribes/${slug}/admissions/activity/snapshot`, { timeout: VALIDATION.browserTimeoutMs }));
                expect(response.status()).toBe(403);
                expect(await response.json()).not.toHaveProperty("currentUsage");
                const page = await guardianContext.newPage();
                await runPrivateBrowserRequest("guardian_connections", () => page.goto(`${origin}/${slug}/academia/admissions/messaging/connections`, { waitUntil: "commit" }));
                await page.getByRole("region", { name: "Estado de mensajería" }).waitFor({ timeout: VALIDATION.browserTimeoutMs });
                expect(await page.getByRole("textbox").count()).toBe(0);
                expect(await page.getByRole("link", { name: "Ver consumo e historial" }).count()).toBe(0);
                expect(await page.getByRole("main").innerText()).not.toContain(fixture.userId);
              } finally { await guardianContext.close(); }
            } finally { await browser.close(); }
        }, { messagingSecurity: { environment: "synthetic-read-without-keys", securityEpoch: "synthetic-unavailable", keyringsJson: "" } }));
        stage = "unchanged_usage_and_no_sends";
        expect(await usage.operations.read(usage.contexts.read)).toMatchObject({ policy: { version, verificationDailyLimit: limit, consumption: { verificationToday: 0, notificationToday: 0 } } });
        const counts = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${fixture.tribeId}) as connections,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_reservations where tribe_id=${fixture.tribeId}) as reservations`)).rows);
        expect(counts).toEqual([{ connections: 0, deliveries: 0, reservations: 0 }]);
        await writeFile(join(artifacts, `${engine}-${width}-${VALIDATION.reportFile}`), JSON.stringify({ matrix, missingKeyrings: true, connections: 0, deliveries: 0, reservations: 0, currentVersion: version, historicalVersion: 1, guardianEngine: engine }, null, 2));
      });
    } catch (error) {
      // Native browser/SQL exceptions can retain cookies or parameter values; only fixed stage metadata leaves this boundary.
      const diagnostics: { category: string; code?: string; constraint?: string; table?: string; frames: string[]; knownFailure?: string }[] = [];
      let current: unknown = error;
      while (current instanceof Error && diagnostics.length < 5) {
        const diagnostic: (typeof diagnostics)[number] = { category: current.name, frames: [...(current.stack ?? "").matchAll(/(?:^|[/\\])([\w.-]+\.(?:ts|tsx|js|cjs|mjs):\d+:\d+)/gmu)].slice(0, 4).map((frame) => frame[1]) };
        for (const field of ["code", "constraint", "table"] as const) {
          const value: unknown = Reflect.get(current, field);
          if (typeof value === "string" && /^[a-zA-Z0-9_]{1,120}$/u.test(value)) diagnostic[field] = value;
        }
        const knownFailure = current.message.match(/^(?:AcademyAdmissionDatabase\.[A-Za-z]+|Owned feature migration command) failed: (?:[a-z_]+|exit=[A-Z_0-9]+)/u);
        if (knownFailure) diagnostic.knownFailure = knownFailure[0];
        diagnostics.push(diagnostic); current = current.cause;
      }
      process.stdout.write(JSON.stringify({ phase: "activity_native_failure", stage, diagnostics }) + "\n");
      throw new Error(`Native admission activity validation failed: stage=${stage}; category=${error instanceof Error ? error.name : "unavailable"}`);
    }
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
