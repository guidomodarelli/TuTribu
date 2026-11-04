/** @vitest-environment node */
/** Exercises the actual built settings UI, cookies, SQL and original recovery across Chromium and WebKit without provider sends. @module admission-notification-settings-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { chromium, webkit, type Page } from "@playwright/test";
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
import { ADMISSION_NOTIFICATION_SETTINGS_STORAGE_PREFIX } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { pressFocused } from "@/tests/support/keyboard-browser";

/** Every engine/viewport owns a fresh database and server; the desktop case also captures recovery. */
const scenarios = [{ name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "chromium", engine: chromium, width: 1280 }];

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native admission notification settings UI", () => {
  it.each(scenarios)("should save own settings and keep current authority on $name at $width", async (scenario) => {
    let stage = "prepare_native_database";
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
        const messagingSecurity = { environment: "synthetic-notification-settings-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
        const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
        const fixture = await prepareAdmissionEmailSettings(database, config);
        await fixture.selectConnection(); await fixture.prepareEmail();
        const tribeId = fixture.read.tribeId, slug = `email-settings-${tribeId}`, guardianId = randomUUID(), guardianSessionId = randomUUID(), guardianToken = randomUUID();
        await database.withContext(fixture.own, async (transaction) => {
          await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${guardianId},'Synthetic settings guardian',${`${guardianId}@example.invalid`},false,clock_timestamp(),clock_timestamp())`);
          await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${guardianSessionId},${guardianId},${guardianToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
          await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${guardianId},'guardian','active')`);
        });
        const leaderToken = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ token: string }>(sql`select token from public.session where id=${fixture.read.sessionId}`)).rows[0].token);
        const artifacts = process.env.ADMISSION_NOTIFICATION_SETTINGS_ARTIFACT_ROOT ?? join(process.cwd(), "test-results", "admission-notification-settings");
        await mkdir(artifacts, { recursive: true });
        const matrix: { engine: string; width: number; emailVersion: number; preferenceWrites: number; emailWrites: number; historyEvents: number; documentNavigationsAfterReady: number; routeReadsAfterReady: number }[] = [];
        let originalVersion: number | null = null, recoveredVersion: number | null = null;

        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
          const route = `${origin}/${slug}/academia/admissions/notifications`;
          const forbidden = [secret, leaderToken, guardianToken, fixture.own.userId, fixture.own.email, fixture.read.sessionId, tribeId, guardianId, guardianSessionId];
          /** @param page - Current actual UI. @param name - Stable capture reference. @param actor - Context-specific export so a second account cannot overwrite the first capture set. @returns A sanitized DOM export through the canonical capture helper. */
          const capture = (page: Page, name: string, actor = "leader") => captureAdmissionReview(page, name, forbidden, `notification-settings-${actor}-captures.json`, { selector: 'section[aria-label="Avisos de admisión"]' });
          {
            stage = `${scenario.name}_${scenario.width}_initial`;
            const current = (await fixture.repository.get(fixture.read)).settings;
            const reset = await fixture.repository.change(fixture.change, fixture.command(current.version, false));
            expect(reset).toMatchObject({ state: "completed" });
            const browser = await scenario.engine.launch({ headless: true });
            try {
              const context = await browser.newContext({ viewport: { width: scenario.width, height: VALIDATION.height }, reducedMotion: scenario.name === "chromium" && scenario.width === 1280 ? "reduce" : "no-preference" });
              const page = await context.newPage(), errors: string[] = [], statuses: { resource: string; status: number }[] = [];
              let completed = false, forwardingFailed = false, forwardedStatus: number | null = null;
              let mutationsStarted = false, documentNavigationsAfterReady = 0, routeReadsAfterReady = 0, navigations = 0;
              try {
                const cookie = encodeURIComponent(`${leaderToken}.${await makeSignature(leaderToken, secret)}`);
                await runPrivateBrowserRequest("bind_notification_leader_cookie", () => context.addCookies([{ name: "better-auth.session_token", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" }]));
                page.setDefaultTimeout(VALIDATION.browserTimeoutMs);
                page.on("pageerror", () => errors.push("page_error"));
                page.on("console", (message) => { if (message.type() === "error" && /hydration|server rendered|did not match/i.test(message.text())) errors.push("hydration_error"); });
                page.on("response", (response) => { const path = new URL(response.url()).pathname; if (path.endsWith("/notification-preferences") || path.endsWith("/email-settings")) statuses.push({ resource: path.endsWith("/email-settings") ? "email" : "preference", status: response.status() }); });
                let preferenceReads = 0, emailReads = 0, preferenceWrites = 0, emailWrites = 0;
                page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations++; });
                page.on("request", (request) => {
                  const path = new URL(request.url()).pathname;
                  // Next also emits same-document history events; actual document requests and page fetches detect reload/refresh.
                  if (mutationsStarted && request.isNavigationRequest() && request.frame() === page.mainFrame()) documentNavigationsAfterReady++;
                  if (mutationsStarted && request.method() === "GET" && path === new URL(route).pathname && !request.isNavigationRequest()) routeReadsAfterReady++;
                  if (path.endsWith("/notification-preferences")) { if (request.method() === "GET") preferenceReads++; else if (request.method() === "PATCH") preferenceWrites++; }
                  if (path.endsWith("/email-settings")) { if (request.method() === "GET") emailReads++; else if (request.method() === "POST") emailWrites++; }
                });
                await page.goto(route, { waitUntil: "domcontentloaded" });
                await page.getByRole("heading", { name: "Avisos de admisión", exact: true }).waitFor();
                await page.getByRole("button", { name: "Continuar", exact: true }).waitFor();
                await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Consultar estado actual" && !button.disabled));
                expect(preferenceReads).toBe(0); expect(emailReads).toBe(0);
                expect(await page.getByRole("checkbox", { name: "Habilitar correo de admisión", exact: true }).isChecked()).toBe(false);
                const surface = page.getByRole("region", { name: "Avisos de admisión", exact: true });
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
                await surface.screenshot({ path: join(artifacts, `${scenario.name}-${scenario.width}-ready.png`) });
                if (scenario.name === "chromium" && scenario.width === 1280) await capture(page, "notification-settings-leader");

                stage = `${scenario.name}_${scenario.width}_own_preference`;
                mutationsStarted = true;
                // The guided flow leaves the tribe email untouched and saves only the personal frequency, by keyboard only.
                await pressFocused(page.getByRole("button", { name: "Continuar", exact: true }), "Enter");
                const captured = scenario.name === "chromium" && scenario.width === 1280;
                if (captured) await capture(page, "notification-settings-frequency");
                const daily = !(await page.getByRole("radio", { name: /^Resumen diario/ }).isChecked());
                const frequency = page.getByRole("radio", { name: daily ? /^Resumen diario/ : /^Agrupar cada cinco minutos/ });
                await pressFocused(frequency, "Space");
                await expect.poll(() => frequency.isChecked()).toBe(true);
                await pressFocused(page.getByRole("button", { name: "Continuar", exact: true }), "Enter");
                await pressFocused(page.getByRole("checkbox", { name: "Revisé el resumen y quiero guardar estos avisos.", exact: true }), "Space");
                if (captured) await capture(page, "notification-settings-review");
                await pressFocused(page.getByRole("button", { name: "Guardar avisos", exact: true }), "Enter");
                await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Tus avisos quedaron guardados.", { exact: true }).waitFor();
                expect(preferenceWrites).toBe(1); expect(emailWrites).toBe(0);
                expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select mode from public.admission_notification_preferences where tribe_id=${tribeId} and recipient_user_id=${fixture.own.userId}`)).rows[0])).toEqual({ mode: daily ? "daily" : "grouped" });
                if (scenario.name === "chromium" && scenario.width === 1280) await capture(page, "notification-settings-preference-saved");

                const lossScenario = scenario.name === "chromium" && scenario.width === 1280;
                let completionObserved = false;
                const lostReply = lossScenario ? page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/email-settings") && response.request().method() === "POST" && response.status() === 502) : null;
                if (lossScenario) await page.route("**/admissions/email-settings", async (request) => {
                  if (request.request().method() !== "POST" || completionObserved) { await request.continue(); return; }
                  try {
                    const reply = await runPrivateBrowserRequest("observe_original_settings_commit", () => request.fetch({ timeout: VALIDATION.browserTimeoutMs }));
                    forwardedStatus = reply.status(); completionObserved = forwardedStatus === 200;
                  } catch { forwardingFailed = true; }
                  // Always resolve the intercepted browser request; a failed forward still fails the commit assertion.
                  try { await request.fulfill({ status: 502, contentType: "application/json", body: "{}" }); }
                  catch { forwardingFailed = true; await request.abort().catch(() => { /* The page may already have closed; forwardingFailed retains this diagnostic. */ }); }
                });
                /** Walks the remaining guided steps to the review and runs the final save with a fresh confirmation. */
                const reviewAndSave = async () => {
                  while (await page.getByRole("button", { name: "Continuar", exact: true }).count()) await page.getByRole("button", { name: "Continuar", exact: true }).click();
                  await page.getByRole("checkbox", { name: "Revisé el resumen y quiero guardar estos avisos.", exact: true }).check();
                  await page.getByRole("button", { name: "Guardar avisos", exact: true }).click();
                };
                stage = `${scenario.name}_${scenario.width}_email_enable_control`;
                await page.getByRole("button", { name: "Cambiar avisos", exact: true }).click();
                await page.getByRole("checkbox", { name: "Habilitar correo de admisión", exact: true }).check();
                stage = `${scenario.name}_${scenario.width}_email_timezone`;
                await page.getByLabel("Zona horaria de la tribu", { exact: true }).fill("Asia/Kolkata");
                if (captured) await capture(page, "notification-settings-tribe-email");
                stage = `${scenario.name}_${scenario.width}_email_submit_control`;
                await reviewAndSave();
                if (lossScenario) {
                  stage = "wait_for_confirmed_commit_and_lost_reply";
                  await runPrivateBrowserRequest("wait_for_native_lost_settings_reply", () => lostReply!);
                  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Consultar estado actual" && !button.disabled));
                  await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText(/Conservamos el cambio original/).waitFor(); expect(forwardingFailed).toBe(false); expect(completionObserved).toBe(true);
                  await capture(page, "notification-settings-response-lost");
                  const original = (await fixture.repository.get(fixture.read)).settings; originalVersion = original.version;
                  expect(original).toMatchObject({ enabled: true, timeZone: "Asia/Kolkata" });
                  expect(await fixture.repository.change(fixture.change, fixture.command(original.version, false, "UTC"))).toMatchObject({ state: "completed" });
                  stage = "recover_original";
                  await page.getByRole("button", { name: "Consultar estado actual", exact: true }).click();
                  await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Recuperamos el resultado del cambio original. Los ajustes actuales se consultaron por separado.", { exact: true }).waitFor();
                  await page.getByRole("button", { name: "Atrás", exact: true }).click(); await page.getByRole("button", { name: "Atrás", exact: true }).click();
                  expect(await page.getByRole("checkbox", { name: "Habilitar correo de admisión", exact: true }).isChecked()).toBe(false);
                  recoveredVersion = (await fixture.repository.get(fixture.read)).settings.version;
                  expect(recoveredVersion).toBe(original.version + 1); expect(emailWrites).toBe(1);
                  await capture(page, "notification-settings-recovered-current");

                  stage = "new_write_with_session_only";
                  await page.getByRole("checkbox", { name: "Habilitar correo de admisión", exact: true }).check();
                  expect(await page.getByLabel("Zona horaria de la tribu", { exact: true }).inputValue()).toBe("UTC");
                  await reviewAndSave();
                  await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Tus avisos quedaron guardados.", { exact: true }).waitFor();
                  expect((await fixture.repository.get(fixture.read)).settings).toMatchObject({ enabled: true, version: recoveredVersion + 1 });
                  expect(await page.getByRole("button", { name: /Google/ }).count() + await page.getByRole("link", { name: /Google/ }).count()).toBe(0);
                  expect(emailWrites).toBe(2); await capture(page, "notification-settings-saved-after-recovery");

                  stage = "partial_save_keeps_saved_email";
                  const region = page.getByRole("region", { name: "Avisos de admisión", exact: true });
                  await page.getByRole("button", { name: "Cambiar avisos", exact: true }).click();
                  await page.getByLabel("Zona horaria de la tribu", { exact: true }).fill("America/Argentina/Buenos_Aires");
                  await page.getByRole("button", { name: "Continuar", exact: true }).click();
                  const individual = page.getByRole("radio", { name: /^Un correo por aviso/ });
                  await (await individual.isChecked() ? page.getByRole("radio", { name: /^Agrupar cada cinco minutos/ }) : individual).click();
                  /** The personal preference fails after the tribe email is confirmed, so the page reports what stayed saved. */
                  await page.route("**/admissions/notification-preferences", (request) => request.request().method() === "PATCH" ? request.fulfill({ status: 503, contentType: "application/json", body: "{}" }) : request.continue());
                  await reviewAndSave();
                  await region.getByText("El correo de la tribu quedó guardado. Falta guardar tu preferencia.", { exact: true }).waitFor();
                  expect(emailWrites).toBe(3); await capture(page, "notification-settings-partial");
                  await page.unroute("**/admissions/notification-preferences");
                  stage = "partial_retry_saves_only_the_preference";
                  await page.getByRole("button", { name: "Consultar estado actual", exact: true }).click();
                  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Consultar estado actual" && !button.disabled));
                  await reviewAndSave();
                  await region.getByText("Tus avisos quedaron guardados.", { exact: true }).waitFor();
                  expect(emailWrites).toBe(3);
                } else {
                  stage = `${scenario.name}_${scenario.width}_email_confirmed_result`;
                  await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Tus avisos quedaron guardados.", { exact: true }).waitFor();
                  stage = `${scenario.name}_${scenario.width}_verify_native_email_settings`;
                  expect((await fixture.repository.get(fixture.read)).settings).toMatchObject({ enabled: true, timeZone: "Asia/Kolkata" }); expect(emailWrites).toBe(1);
                }
                stage = `${scenario.name}_${scenario.width}_verify_no_route_refresh`;
                expect(documentNavigationsAfterReady).toBe(0); expect(routeReadsAfterReady).toBe(0); expect(errors).toEqual([]);
                matrix.push({ engine: scenario.name, width: scenario.width, emailVersion: (await fixture.repository.get(fixture.read)).settings.version, preferenceWrites, emailWrites, historyEvents: navigations, documentNavigationsAfterReady, routeReadsAfterReady });
                completed = true;
              } finally {
                try {
                  const state = await runPrivateBrowserRequest("observe_notification_settings_public_state", () => page.evaluate(() => {
                    const root = document.querySelector('section[aria-label="Avisos de admisión"]');
                    return { alerts: [...root?.querySelectorAll('[role="alert"]') ?? []].map((element) => element.textContent.slice(0, 300)), statuses: [...root?.querySelectorAll('[role="status"]') ?? []].map((element) => element.textContent.slice(0, 300)), buttons: [...root?.querySelectorAll('button') ?? []].map((element) => ({ label: element.textContent.slice(0, 100), disabled: element.disabled })), checks: [...root?.querySelectorAll('[role="checkbox"]') ?? []].map((element) => ({ checked: element.getAttribute("aria-checked"), disabled: element.hasAttribute("disabled") })) };
                  }));
                  /** Reads the private database facts of an incomplete scenario, or marks them unavailable. @returns Safe metadata for the failure artifact. */
                  const readIncompleteMetadata = async (): Promise<unknown> => {
                    try {
                      return await database.withContext(fixture.own, async (transaction) => ({
                        settings: (await transaction.execute(sql`select enabled,version,time_zone from public.admission_email_settings where tribe_id=${tribeId}`)).rows,
                        capabilities: (await transaction.execute(sql`select channel,state from public.messaging_connection_capabilities where tribe_id=${tribeId}`)).rows,
                        operations: (await transaction.execute(sql`select operation_type,state,public_result->>'status' as result_status,public_result->>'reason' as result_reason from public.academy_admission_operations where tribe_id=${tribeId} and actor_user_id=${fixture.own.userId}`)).rows,
                      }));
                    } catch { return { available: false }; }
                  };
                  let databaseMetadata: unknown = null;
                  if (!completed) databaseMetadata = await readIncompleteMetadata();
                  await writeFile(join(artifacts, `${scenario.name}-${scenario.width}-last-public-state.json`), JSON.stringify({ stage, errors, forwardingFailed, forwardedStatus, historyEvents: navigations, documentNavigationsAfterReady, routeReadsAfterReady, responses: statuses, state, databaseMetadata }, null, 2));
                } finally { await context.close(); }
              }
            } finally { await browser.close(); }
          }

          if (scenario.name === "chromium" && scenario.width === 1280) {
          stage = "guardian_initial_authority";
          const browser = await chromium.launch({ headless: true });
          try {
            const context = await browser.newContext({ viewport: { width: 1280, height: VALIDATION.height } });
            try {
              const cookie = encodeURIComponent(`${guardianToken}.${await makeSignature(guardianToken, secret)}`);
              await runPrivateBrowserRequest("bind_notification_guardian_cookie", () => context.addCookies([{ name: "better-auth.session_token", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" }]));
              const page = await context.newPage(); page.setDefaultTimeout(VALIDATION.browserTimeoutMs);
              const staleKey = `${ADMISSION_NOTIFICATION_SETTINGS_STORAGE_PREFIX}:${encodeURIComponent(guardianId)}:${encodeURIComponent(slug)}`;
              const staleIntent = JSON.stringify({ viewerId: guardianId, slug, input: fixture.command(0, true, "UTC") });
              await context.addInitScript(({ key, value }) => window.sessionStorage.setItem(key, value), { key: staleKey, value: staleIntent });
              let privilegedGuardianReads = 0;
              const preferenceReads: number[] = [];
              page.on("request", (request) => { if (new URL(request.url()).pathname.includes("/admissions/operations/")) privilegedGuardianReads++; });
              page.on("response", (response) => { if (new URL(response.url()).pathname.endsWith("/admissions/notification-preferences") && response.request().method() === "GET") preferenceReads.push(response.status()); });
              try {
              await page.goto(route, { waitUntil: "domcontentloaded" });
              await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Guardar avisos" && !button.disabled));
              expect(await page.getByRole("checkbox", { name: "Habilitar correo de admisión", exact: true }).count()).toBe(0);
              expect(privilegedGuardianReads).toBe(0); expect(await page.evaluate((key) => sessionStorage.getItem(key), staleKey)).toBe(staleIntent);
              await capture(page, "notification-settings-guardian", "guardian");
              stage = "guardian_save_personal_preference";
              await page.getByRole("radio", { name: /^Resumen diario/ }).click();
              await page.getByRole("button", { name: "Guardar avisos", exact: true }).click();
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Tus avisos quedaron guardados.", { exact: true }).waitFor();
              expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select mode from public.admission_notification_preferences where tribe_id=${tribeId} and recipient_user_id=${guardianId}`)).rows[0])).toEqual({ mode: "daily" });
              stage = "guardian_preserve_inaccessible_original_after_save";
              expect(await page.evaluate((key) => sessionStorage.getItem(key), staleKey)).toBe(staleIntent); expect(privilegedGuardianReads).toBe(0);
              stage = "guardian_revoke_native_authority";
              const changed = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`update public.tribe_members set status='muted' where tribe_id=${tribeId} and user_id=${guardianId} returning role,status`)).rows);
              expect(changed).toEqual([{ role: "guardian", status: "muted" }]);
              expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${tribeId} and user_id=${guardianId}`)).rows[0])).toEqual({ role: "guardian", status: "muted" });
              stage = "guardian_read_current_denied";
              const denied = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/admissions/notification-preferences") && response.request().method() === "GET");
              await page.getByRole("button", { name: "Consultar estado actual", exact: true }).click();
              expect((await denied).status()).toBe(403);
              stage = "guardian_hide_private_settings_after_denial";
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByRole("alert").waitFor();
              await page.getByRole("button", { name: "Cambiar avisos", exact: true }).waitFor({ state: "detached" });
              expect(await page.getByRole("button", { name: "Cambiar avisos", exact: true }).count()).toBe(0);
              expect(await page.evaluate((key) => sessionStorage.getItem(key), staleKey)).toBe(staleIntent); expect(privilegedGuardianReads).toBe(0);
              await capture(page, "notification-settings-role-lost", "guardian");
              } finally {
                const state = await runPrivateBrowserRequest("observe_notification_guardian_public_state", () => page.evaluate(() => {
                  const root = document.querySelector('section[aria-label="Avisos de admisión"]');
                  return { alerts: [...root?.querySelectorAll('[role="alert"]') ?? []].map((element) => element.textContent.slice(0, 300)), buttons: [...root?.querySelectorAll("button") ?? []].map((button) => ({ label: button.textContent.slice(0, 100), disabled: button.disabled })) };
                }));
                const membership = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${tribeId} and user_id=${guardianId}`)).rows);
                await writeFile(join(artifacts, "guardian-last-public-state.json"), JSON.stringify({ stage, privilegedGuardianReads, preferenceReads, membership, state }, null, 2));
              }
            } finally { await context.close(); }
          } finally { await browser.close(); }
          }
        }, { messagingSecurity }));

        const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.academy_admission_policies where tribe_id=${tribeId}) as policies`)).rows[0]);
        expect(effects).toEqual({ deliveries: 0, policies: 0 });
        await writeFile(join(artifacts, `${scenario.name}-${scenario.width}-native-proof.json`), JSON.stringify({ capturedAt: new Date().toISOString(), matrix, originalVersion, recoveredVersion, roleLossExercised: scenario.name === "chromium" && scenario.width === 1280, effects, externalMessagesSent: 0 }, null, 2));
      });
    } catch (error) {
      const failureName = error instanceof Error ? error.name : "unknown_failure";
      const diagnostic = error instanceof Error && (error.name === "TimeoutError" || error.name === "AssertionError") ? error.message.split("\n")[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[synthetic-id]") : failureName;
      throw new Error(`Native notification settings UI failed at ${stage}: ${diagnostic}`, { cause: error });
    }
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
