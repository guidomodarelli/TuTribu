/** @vitest-environment node */
/** Exercises the personal Next UI, native accounts/SQL/crypto and the real SDK with closed synthetic provider HTTP. @module personal-invitation-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { enterAdmissionVerificationCode } from "@/tests/support/admission-contact-browser-actions";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_CONTACT_COPY, ADMISSION_CONTACT_INTENT_DIAGNOSTIC } from "@/src/modules/academy-admissions/constants/admission-contact-browser";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native personal invitation UI", () => {
  it.concurrent.each([
    { name: "chromium", engine: chromium, width: 1280, phone: false }, { name: "chromium", engine: chromium, width: 390, phone: false },
    { name: "webkit", engine: webkit, width: 1280, phone: false }, { name: "webkit", engine: webkit, width: 390, phone: false },
    { name: "chromium", engine: chromium, width: 1280, phone: true }, { name: "chromium", engine: chromium, width: 390, phone: true },
    { name: "webkit", engine: webkit, width: 1280, phone: true }, { name: "webkit", engine: webkit, width: 390, phone: true },
  ])("should verify a personal contact and recover one original canje on $name at $width phone=$phone", async ({ name, engine, width, phone }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-personal-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const personal = await preparePersonalContactIssuance(database, phone, config), fixture = personal.fixture, slug = `issue-${fixture.context.tribeId}`;
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007004000_read_exact_own_admission_request.sql", "20261008210000_claim_scoped_admission_delivery.sql", "20261008220000_scope_admission_operation_recovery.sql", "20261008230000_read_admission_contact_choices.sql"]) await database.applyMigration(migration);
      let providerRequests = 0, receivedCode = "";
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browser = await engine.launch({ headless: true }), context = await browser.newContext({ viewport: { width, height: 900 } });
        const cookie = `${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`;
        await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(cookie), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
        const page = await context.newPage(), failures: string[] = [];
        let workflowPhase = "initial";
        /** Emits only completed driver phases to distinguish browser waiting from server work. */
        const completedStep = (stage: string) => process.stdout.write(JSON.stringify({ phase: "personal_ui_step", engine: name, width, phone, stage }) + "\n");
        const forbidden = [fixture.context.userId, fixture.sessionToken, fixture.fixture.credential, fixture.own.email, fixture.input.contact.value, secret, personal.token.token];
        page.setDefaultTimeout(180_000);
        page.on("pageerror", (error) => { const reactCode = error.message.match(/Minified React error #(\d+)/u)?.[1]; failures.push(`${workflowPhase}:${error.name}${reactCode ? `:react-${reactCode}` : ""}`); });
        page.on("console", (message) => { if (message.type() === "error" && /hydration|hydrating/i.test(message.text())) failures.push("hydration"); if (message.type() === "error" && message.text().startsWith(ADMISSION_CONTACT_INTENT_DIAGNOSTIC)) { void Promise.all(message.args().slice(1).map((argument) => argument.jsonValue())).then((metadata) => process.stdout.write(JSON.stringify({ phase: "safe_contact_persistence_error", metadata }) + "\n")); } });
        let submissions = 0, issueRequests = 0, authRequests = 0, lostReply = true;
        const issueStatuses: number[] = [], authStatuses: number[] = [];
        page.on("request", (request) => { const path = new URL(request.url()).pathname; if (request.method() === "POST" && path.endsWith("/challenges")) issueRequests += 1; if (path.endsWith("/get-session")) authRequests += 1; });
        page.on("response", (response) => { const path = new URL(response.url()).pathname; if (path.endsWith("/challenges")) issueStatuses.push(response.status()); if (path.endsWith("/get-session")) authStatuses.push(response.status()); });
        try {
          try { await page.goto(`${origin}/admissions/invitations/${personal.token.token}`, { waitUntil: "domcontentloaded" }); }
          catch { throw new Error("Personal invitation UI navigation was unavailable"); }
          const codeConfirmation = page.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i });
          await codeConfirmation.waitFor({ state: "visible" });
          await page.waitForFunction(() => Array.from(document.querySelectorAll('section[aria-labelledby] button[role="checkbox"]')).some((element) => !element.hasAttribute("disabled")));
          completedStep("ready");
          expect(providerRequests).toBe(0); expect(await fixture.counts()).toMatchObject({ challenges: 0, proofs: 0, memberships: 0 });
          expect(await page.locator('meta[name="referrer"]').getAttribute("content")).toBe("no-referrer");
          workflowPhase = "before_code_capture";
          if (name === "chromium" && width === 1280 && !phone) await captureAdmissionReview(page, "personal-before-code", forbidden, "personal-invitation-captures.json");
          if (phone) { try { await page.getByLabel("Teléfono para este ingreso").fill(fixture.input.contact.value); } catch { throw new Error("Personal invitation phone input was unavailable"); } }
          workflowPhase = "issuing"; await codeConfirmation.click(); await page.getByRole("button", { name: "Enviar código de ingreso", exact: true }).click();
          completedStep("issue_clicked");
          const codeField = page.getByLabel("Código de ingreso", { exact: true });
          let terminal = await Promise.race([codeField.waitFor({ state: "visible" }).then(() => "code").catch(() => "unavailable"), page.locator("main").getByRole("alert").first().waitFor({ state: "visible" }).then(() => "feedback").catch(() => "unavailable")]);
          if (terminal === "feedback") {
            const recoverCode = page.getByRole("button", { name: "Consultar operación del código", exact: true });
            if (await recoverCode.count()) {
              await recoverCode.click();
              terminal = await Promise.race([codeField.waitFor({ state: "visible" }).then(() => "code").catch(() => "unavailable"), page.locator("main").getByRole("alert").first().waitFor({ state: "visible" }).then(() => "feedback").catch(() => "unavailable")]);
              completedStep("code_original_read");
            }
          }
          if (terminal !== "code") {
            const observation = await page.evaluate((catalogue) => {
              const alerts = Array.from(document.querySelectorAll('[role="alert"]')).map((element) => element.textContent?.trim());
              const section = document.querySelector('section[aria-labelledby][aria-busy]');
              const input = document.querySelector('input[autocomplete="one-time-code"]');
              return { publicCodes: catalogue.filter(([, message]) => alerts.includes(message)).map(([code]) => code), confirm: section?.querySelector('[role="checkbox"]')?.getAttribute("aria-checked"), busy: section?.getAttribute("aria-busy"), secure: isSecureContext, uuid: typeof crypto.randomUUID, phoneInvalid: document.querySelector('input[type="tel"]')?.getAttribute("aria-invalid"), codeField: Boolean(input), codeLabelAssociated: Boolean(input && Array.from(document.querySelectorAll("label")).some((label) => label.htmlFor === input.id && label.textContent?.trim() === "Código de ingreso")) };
            }, [...Object.entries(ADMISSION_ERROR_MESSAGE), ...Object.entries(ADMISSION_CONTACT_COPY)]);
            throw new Error(`Personal code issuance did not produce a usable field ${JSON.stringify({ issueRequests, issueStatuses, authRequests, authStatuses, providerRequests, failures, ...observation })}`);
          }
          completedStep("code_visible");
          await page.waitForFunction(() => Boolean(document.querySelector('input[autocomplete="one-time-code"]')));
          const codeArrivedAt = Date.now();
          while (receivedCode.length !== 6 && Date.now() - codeArrivedAt < 60_000) await new Promise((resolve) => setTimeout(resolve, 250));
          expect(providerRequests).toBe(1); expect(receivedCode.length === 6).toBe(true);
          workflowPhase = "verifying"; await enterAdmissionVerificationCode(page, receivedCode); await page.getByRole("button", { name: "Comprobar código", exact: true }).click();
          completedStep("verify_clicked");
          await page.getByText("Código comprobado para este ingreso.", { exact: true }).waitFor({ state: "visible" });
          completedStep("verified");
          await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${personal.invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]); expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 0 }]); });
          if (name === "chromium" && width === 1280 && !phone) await captureAdmissionReview(page, "personal-code-verified", [...forbidden, receivedCode], "personal-invitation-captures.json");
          await page.route(`**/api/tribes/${slug}/admissions/submissions`, async (route) => {
            if (route.request().method() === "POST") submissions += 1;
            if (lostReply && route.request().method() === "POST") { lostReply = false; try { await route.fetch({ timeout: 180_000 }); } catch { await route.abort().catch(() => {}); return; } await route.fulfill({ status: 502, contentType: "application/json", body: "{}" }); }
            else await route.continue();
          });
          workflowPhase = "submitting"; await page.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }).click(); await page.getByRole("button", { name: "Confirmar invitación", exact: true }).click();
          completedStep("canje_clicked");
          const original = page.getByRole("button", { name: "Consultar operación original", exact: true }); await original.waitFor({ state: "visible" });
          await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent === "Consultar operación original" && !button.disabled));
          if (name === "chromium" && width === 1280 && !phone) await captureAdmissionReview(page, "personal-response-lost", [...forbidden, receivedCode], "personal-invitation-captures.json");
          workflowPhase = "recovering"; await original.click(); await page.getByRole("link", { name: "Ver mi solicitud", exact: true }).waitFor({ state: "visible" });
          completedStep("recovered");
          expect(submissions).toBe(1); expect(issueRequests).toBe(1); expect(providerRequests).toBe(1);
          expect(failures).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
          const privatePersisted = await page.evaluate((privateValues) => Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.getItem(sessionStorage.key(index)!)).some((value) => privateValues.some((privateValue) => Boolean(value?.includes(privateValue)))), [personal.token.token, receivedCode, fixture.sessionToken]);
          expect(privatePersisted).toBe(false);
          await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${personal.invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2 }]); expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId} and status='pending' and source='personal'`)).rows).toEqual([{ count: 1 }]); });
          if (name === "chromium" && width === 1280 && !phone) await captureAdmissionReview(page, "personal-pending", [...forbidden, receivedCode], "personal-invitation-captures.json");
        } finally { await page.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); await browser.close(); }
      }, { messagingSecurity, preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: phone ? "synthetic-sms-sender" : fixture.fixture.emailSenderId, ADMISSION_TEST_ZAVU_RECIPIENT: fixture.input.contact.value, ADMISSION_TEST_ZAVU_DIAGNOSTIC_CHANNEL: phone ? "sms" : "email", ADMISSION_TEST_ZAVU_TEST_MODE: "false" }, onProviderRequest: () => { providerRequests += 1; }, onDiagnosticCode: (code) => { receivedCode = code; } }));
    });
  }, 1_200_000);
});
