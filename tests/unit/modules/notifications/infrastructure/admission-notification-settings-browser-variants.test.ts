/** @vitest-environment node */
/** Exercises real recoverable settings variants and captures their owned local UI without provider sends. @module admission-notification-settings-browser-variants-tests */
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
import { ADMISSION_NOTIFICATION_SETTINGS_STORAGE_PREFIX } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { authorizeAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-authorizer";
import { admissionEmailSettingsChangeResultSchema } from "@/src/modules/notifications/application/results/admission-email-settings-result-schemas";

/** Each bounded flow owns its database and process; separating them does not extend either deadline. */
const scenarios = (["validation", "recovery"] as const).flatMap((name) => [
  { name, engine: chromium, width: 1280 }, { name, engine: chromium, width: 390 }, { name, engine: webkit, width: 1280 }, { name, engine: webkit, width: 390 },
]);

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native admission notification settings recovery variants", () => {
  it.each(scenarios)("should exercise native $name controls without automatic retries or provider sends at $width px", async (scenario) => {
    let stage = "prepare_variant_database";
    const captures: string[] = [];
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
        const messagingSecurity = { environment: "synthetic-notification-settings-variants", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
        const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
        const fixture = await prepareAdmissionEmailSettings(database, config); await fixture.selectConnection();
        if (scenario.name === "recovery") expect(await fixture.repository.change(fixture.change, fixture.command(0, false, "UTC"))).toMatchObject({ state: "completed", result: { status: "changed", settings: { version: 1 } } });
        const tribeId = fixture.read.tribeId, slug = `email-settings-${tribeId}`;
        const alternateUserId = randomUUID(), alternateToken = randomUUID(), alternateSessionId = randomUUID(), alternateEmail = `${alternateUserId}@example.invalid`;
        await database.withContext(fixture.own, async (transaction) => {
          await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${alternateUserId},'Synthetic alternate settings account',${alternateEmail},false,clock_timestamp(),clock_timestamp())`);
          await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${alternateSessionId},${alternateUserId},${alternateToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        });
        const token = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ token: string }>(sql`select token from public.session where id=${fixture.read.sessionId}`)).rows[0].token);
        const artifacts = process.env.ADMISSION_NOTIFICATION_SETTINGS_ARTIFACT_ROOT ?? join(process.cwd(), "test-results", "admission-notification-settings-variants");
        await mkdir(artifacts, { recursive: true });
        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
          const browser = await scenario.engine.launch({ headless: true });
          const context = await browser.newContext({ viewport: { width: scenario.width, height: VALIDATION.height }, reducedMotion: "reduce" });
          let releaseAuthentication = () => {}, holdAuthentication = scenario.name === "validation";
          const authenticationBarrier = new Promise<void>((resolve) => { releaseAuthentication = resolve; });
          const intercepted: Promise<void>[] = [];
          try {
            const cookie = encodeURIComponent(`${token}.${await makeSignature(token, secret)}`);
            await runPrivateBrowserRequest("bind_notification_variant_cookie", () => context.addCookies([{ name: "better-auth.session_token", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" }]));
            const page = await context.newPage(); page.setDefaultTimeout(VALIDATION.browserTimeoutMs);
            const forbidden = [secret, token, fixture.own.userId, fixture.own.email, fixture.read.sessionId, tribeId, alternateUserId, alternateToken, alternateSessionId, alternateEmail];
            const route = `${origin}/${slug}/academia/admissions/notifications`, preferencePath = `${origin}/api/tribes/${slug}/admissions/notification-preferences`;
            const storedKey = `${ADMISSION_NOTIFICATION_SETTINGS_STORAGE_PREFIX}:${encodeURIComponent(fixture.own.userId)}:${encodeURIComponent(slug)}`;
            const errors: string[] = []; let emailWrites = 0;
            page.on("pageerror", (error) => errors.push(error.name));
            page.on("request", (request) => { if (new URL(request.url()).pathname.endsWith("/admissions/email-settings") && request.method() === "POST") emailWrites++; });
            /** Waits for current native identity and the end of the single request slot. */
            const ready = () => page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Consultar estado actual" && !button.disabled));
            /** Uses the actual review checkbox; returning or restoring an original never supplies consent. */
            const confirm = () => page.getByRole("checkbox", { name: "Revisé el resumen y quiero guardar estos avisos.", exact: true }).check();
            /** Walks the remaining guided steps to the review and runs the final save with a fresh confirmation. */
            const reviewAndSave = async () => {
              while (await page.getByRole("button", { name: "Continuar", exact: true }).count()) await page.getByRole("button", { name: "Continuar", exact: true }).click();
              await confirm(); await page.getByRole("button", { name: "Guardar avisos", exact: true }).click();
            };
            /** Waits for the actual same-origin read before testing its final rendered state. */
            const readCurrent = async () => {
              const response = page.waitForResponse((reply) => new URL(reply.url()).pathname.endsWith("/admissions/notification-preferences") && reply.request().method() === "GET");
              await page.getByRole("button", { name: "Consultar estado actual", exact: true }).click(); expect((await response).status()).toBe(200); await ready();
            };
            /** Exports only the real named page surface with synthetic identities excluded. */
            const capture = async (name: string) => { if (scenario.engine !== chromium || scenario.width !== 1280) return; await captureAdmissionReview(page, name, forbidden, `notification-settings-${scenario.name}-captures.json`, { selector: 'section[aria-label="Avisos de admisión"]' }); captures.push(name); };
            /** Records bounded diagnostic progress even if the test deadline later interrupts the flow. */
            const mark = async (value: string) => { stage = value; await writeFile(join(artifacts, `${scenario.name}-${scenario.engine.name()}-${scenario.width}-progress.json`), JSON.stringify({ stage, at: new Date().toISOString(), captures, emailWrites }, null, 2)); };
            try {
              if (scenario.name === "validation") {
              await mark("loading_native_identity");
              await page.route("**/api/auth/get-session**", (request) => {
                const work = (async () => { if (holdAuthentication) await authenticationBarrier; await request.continue(); })(); intercepted.push(work); return work;
              });
              const observedAuthentication = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith("/api/auth/get-session"));
              await page.goto(route, { waitUntil: "domcontentloaded" }); await observedAuthentication;
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Consultando los ajustes actuales…", { exact: true }).waitFor();
              expect(await page.getByRole("button", { name: "Continuar", exact: true }).isDisabled()).toBe(true);
              await capture("notification-settings-loading");
              holdAuthentication = false; releaseAuthentication(); await ready();

              await mark("genuine_personal_cas_conflict");
              const changed = await runPrivateBrowserRequest("advance_own_notification_preference_version", async () => {
                const response = await context.request.patch(preferencePath, { data: { mode: "individual", expectedVersion: 0 } });
                expect(response.status()).toBe(200); return response.json();
              });
              expect(changed).toMatchObject({ status: "changed", preference: { mode: "individual", version: 1 } });
              await page.getByRole("button", { name: "Continuar", exact: true }).click();
              await page.getByRole("radio", { name: /^Resumen diario/ }).click();
              await reviewAndSave();
              await page.getByRole("alert").filter({ hasText: "Tu preferencia cambió en otra ventana." }).waitFor(); await ready();
              expect(await page.getByRole("button", { name: "Guardar avisos", exact: true }).isDisabled()).toBe(true);
              await capture("notification-settings-preference-conflict");
              await readCurrent();
              await page.getByRole("button", { name: "Atrás", exact: true }).click();
              expect(await page.getByRole("radio", { name: /^Resumen diario/ }).isChecked()).toBe(true);

              await mark("blank_timezone_blocks_first_step");
              await page.getByRole("button", { name: "Atrás", exact: true }).click();
              await page.getByRole("checkbox", { name: "Habilitar correo de admisión", exact: true }).check();
              await page.getByRole("textbox", { name: "Zona horaria de la tribu", exact: true }).fill("");
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Indicá una zona horaria para continuar.", { exact: true }).waitFor();
              expect(await page.getByRole("button", { name: "Continuar", exact: true }).isDisabled()).toBe(true);
              await capture("notification-settings-invalid-zone");
              await page.getByRole("textbox", { name: "Zona horaria de la tribu", exact: true }).fill("Asia/Kolkata");

              await mark("native_unprepared_email_capability");
              await reviewAndSave();
              await page.getByRole("alert").filter({ hasText: "Falta un correo preparado" }).waitFor(); await ready();
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Tu preferencia todavía no se guardó.", { exact: true }).waitFor();
              expect(await fixture.repository.get(fixture.read)).toMatchObject({ enabled: false, version: 0 });
              expect(await page.evaluate((key) => sessionStorage.getItem(key), storedKey)).toBeNull();
              await capture("notification-settings-capability-rejected");
              await readCurrent();

              await mark("genuine_email_cas_conflict");
              expect(await fixture.repository.change(fixture.change, fixture.command(0, false, "UTC"))).toMatchObject({ state: "completed", result: { status: "changed", settings: { version: 1 } } });
              await confirm(); await page.getByRole("button", { name: "Guardar avisos", exact: true }).click();
              await page.getByRole("alert").filter({ hasText: "La configuración cambió en otra ventana." }).waitFor(); await ready();
              await capture("notification-settings-email-conflict");
              } else {
              await mark("load_current_recovery_settings");
              await page.goto(route, { waitUntil: "domcontentloaded" }); await ready();

              await mark("create_genuine_interrupted_original");
              const original = fixture.command(1, false, "Asia/Kolkata"); forbidden.push(original.operationId);
              const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async (transaction) => { await authorizeAdmissionPolicy(transaction, fixture.change, "update_admission_email_settings"); return true; }, async () => config);
              await expect(ledger.run({ actorUserId: fixture.own.userId, tribeId, operationType: "update_admission_email_settings", idempotencyKey: original.operationId, intent: { expectedVersion: original.expectedVersion, enabled: original.enabled, timeZone: original.timeZone } }, admissionEmailSettingsChangeResultSchema, async () => { throw new Error("Synthetic interruption before original settings mutation"); })).rejects.toMatchObject({ code: "operation_unresolved" });
              await mark("persist_genuine_original_for_reload");
              const originalBody = JSON.stringify({ viewerId: fixture.own.userId, slug, input: original });
              await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key: storedKey, value: originalBody });
              const beforeRead = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,lease_owner::text,lease_until::text from public.academy_admission_operations where tribe_id=${tribeId} and idempotency_key=${original.operationId}`)).rows[0]);
              await mark("reload_to_recover_genuine_original");
              await page.reload({ waitUntil: "domcontentloaded" }); await ready();
              await mark("observe_genuine_started_public_state");
              await page.getByRole("alert").filter({ hasText: "El cambio sigue pendiente." }).waitFor();
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Se reintenta el cambio pendiente", { exact: true }).waitFor();
              expect(await page.getByRole("button", { name: "Guardar avisos", exact: true }).isDisabled()).toBe(true);
              expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,lease_owner::text,lease_until::text from public.academy_admission_operations where tribe_id=${tribeId} and idempotency_key=${original.operationId}`)).rows[0])).toEqual(beforeRead);
              await capture("notification-settings-started");
              const writesBeforeResume = emailWrites;
              await mark("retry_active_original_without_effect");
              const activeReply = page.waitForResponse((reply) => new URL(reply.url()).pathname.endsWith("/admissions/email-settings") && reply.request().method() === "POST");
              await confirm(); await page.getByRole("button", { name: "Guardar avisos", exact: true }).click();
              expect(await (await activeReply).json()).toEqual({ state: "started", operationId: original.operationId }); await ready();
              expect(emailWrites).toBe(writesBeforeResume + 1); expect(await fixture.repository.get(fixture.read)).toMatchObject({ version: 1 });
              expect(await page.evaluate((key) => sessionStorage.getItem(key), storedKey)).toBe(originalBody);
              await mark("resume_expired_original_once");
              expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`update public.academy_admission_operations set lease_until=clock_timestamp()-interval '1 second',version=version+1 where tribe_id=${tribeId} and idempotency_key=${original.operationId} and state='started' returning state`)).rows)).toEqual([{ state: "started" }]);
              await readCurrent(); await confirm();
              await page.getByRole("button", { name: "Guardar avisos", exact: true }).click();
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Tus avisos quedaron guardados.", { exact: true }).waitFor(); await ready();
              expect(await fixture.repository.get(fixture.read)).toMatchObject({ version: 2, enabled: false, timeZone: "Asia/Kolkata" });
              expect(await page.evaluate((key) => sessionStorage.getItem(key), storedKey)).toBeNull(); await capture("notification-settings-resumed");

              await mark("absent_original_requires_new_consent");
              const absent = fixture.command(2, false, "UTC"); forbidden.push(absent.operationId);
              await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key: storedKey, value: JSON.stringify({ viewerId: fixture.own.userId, slug, input: absent }) });
              await page.reload({ waitUntil: "domcontentloaded" }); await ready();
              await page.getByRole("alert").filter({ hasText: "El cambio original todavía no aparece registrado." }).waitFor();
              expect(await page.getByRole("button", { name: "Guardar avisos", exact: true }).isDisabled()).toBe(true); await capture("notification-settings-original-absent");
              await confirm(); await page.getByRole("button", { name: "Guardar avisos", exact: true }).click();
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("Tus avisos quedaron guardados.", { exact: true }).waitFor(); await ready();
              expect(await fixture.repository.get(fixture.read)).toMatchObject({ version: 3, timeZone: "UTC" });

              await mark("owned_read_failure_and_explicit_retry");
              await page.route("**/admissions/notification-preferences", async (request) => {
                await request.fulfill({ status: 503, contentType: "text/plain", body: "Synthetic owned read unavailable" });
              }, { times: 1 });
              await page.getByRole("button", { name: "Consultar estado actual", exact: true }).click();
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByRole("alert").waitFor();
              expect(await page.getByRole("button", { name: "Cambiar avisos", exact: true }).count()).toBe(0); await capture("notification-settings-read-failed");
              const writesBeforeRecovery = emailWrites;
              await page.getByRole("button", { name: "Reintentar", exact: true }).click(); await ready();
              expect(await page.getByRole("button", { name: "Cambiar avisos", exact: true }).count()).toBe(1); expect(emailWrites).toBe(writesBeforeRecovery);
              await capture("notification-settings-read-recovered");

              await mark("review_without_changes_writes_nothing");
              await page.getByRole("button", { name: "Cambiar avisos", exact: true }).click();
              while (await page.getByRole("button", { name: "Continuar", exact: true }).count()) await page.getByRole("button", { name: "Continuar", exact: true }).click();
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText("No hay cambios para guardar.", { exact: true }).waitFor();
              expect(await page.getByRole("button", { name: "Guardar avisos", exact: true }).isDisabled()).toBe(true); expect(emailWrites).toBe(writesBeforeRecovery);
              expect(await fixture.repository.get(fixture.read)).toMatchObject({ version: 3, timeZone: "UTC" }); await capture("notification-settings-email-unchanged");

              await mark("lost_write_keeps_original_without_google");
              await page.getByRole("button", { name: "Atrás", exact: true }).click(); await page.getByRole("button", { name: "Atrás", exact: true }).click();
              await page.getByRole("checkbox", { name: "Habilitar correo de admisión", exact: true }).check();
              await page.getByRole("textbox", { name: "Zona horaria de la tribu", exact: true }).fill("Asia/Kolkata");
              await page.route("**/admissions/email-settings", (route) => route.request().method() === "POST" ? route.abort("failed") : route.fallback(), { times: 1 });
              await reviewAndSave();
              await page.getByRole("region", { name: "Avisos de admisión", exact: true }).getByText(/Conservamos el cambio original/).waitFor(); await ready();
              expect(await page.getByRole("button", { name: /Google/ }).count() + await page.getByRole("link", { name: /Google/ }).count()).toBe(0);
              const pending = await page.evaluate((key) => sessionStorage.getItem(key), storedKey); expect(pending).not.toBeNull();
              forbidden.push(JSON.parse(pending!).input.operationId); await capture("notification-settings-lost-write-kept");

              await mark("native_account_changed_hides_old_snapshot");
              const alternateCookie = encodeURIComponent(`${alternateToken}.${await makeSignature(alternateToken, secret)}`);
              await runPrivateBrowserRequest("switch_notification_variant_native_account", async () => {
                await context.clearCookies(); await context.addCookies([{ name: "better-auth.session_token", value: alternateCookie, url: origin, httpOnly: true, sameSite: "Lax" }]);
              });
              await page.getByRole("button", { name: "Consultar estado actual", exact: true }).click();
              await page.getByRole("alert").filter({ hasText: "La cuenta cambió. Volvé a cargar la página antes de continuar." }).waitFor();
              expect(await page.getByRole("form", { name: "Configurar avisos de admisión", exact: true }).count()).toBe(0);
              expect(await page.evaluate((key) => sessionStorage.getItem(key), storedKey)).toBe(pending); await capture("notification-settings-account-changed");
              }
              expect(errors).toEqual([]);
              const finalSettingsVersion = scenario.name === "validation" ? 1 : 3;
              expect(await fixture.repository.get(fixture.read)).toMatchObject({ version: finalSettingsVersion });
              const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${tribeId}) as deliveries,(select count(*)::int from public.academy_admission_policies where tribe_id=${tribeId}) as policies`)).rows[0]);
              expect(effects).toEqual({ deliveries: 0, policies: 0 });
              await mark("completed");
              await writeFile(join(artifacts, `${scenario.name}-${scenario.engine.name()}-${scenario.width}-native-variants-proof.json`), JSON.stringify({ completedAt: new Date().toISOString(), scenario: scenario.name, captures, emailWrites, finalSettingsVersion, ...(scenario.name === "recovery" ? { activeLeasePreserved: true, expiredOriginalResumed: true, originalBodyPreserved: true, readFailureRetriedWithoutWrite: true } : {}), errors, effects, externalMessagesSent: 0 }, null, 2));
            } finally {
              holdAuthentication = false; releaseAuthentication(); await Promise.allSettled(intercepted);
            }
          } finally { await context.close(); await browser.close(); }
        }, { messagingSecurity }));
      });
    } catch (error) {
      const diagnostic = error instanceof Error && (error.name === "TimeoutError" || error.name === "AssertionError") ? error.message.split("\n")[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[synthetic-id]") : error instanceof Error ? error.name : "unknown_failure";
      throw new Error(`Native notification settings variants failed at ${stage}: ${diagnostic}`, { cause: error });
    }
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
