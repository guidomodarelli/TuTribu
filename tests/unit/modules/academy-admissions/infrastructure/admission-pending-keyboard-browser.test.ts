/** @vitest-environment node */
/** Exercises the real pending flow and retry navigation through keyboard events in both browser engines. @module admission-pending-keyboard-browser-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, webkit, type Locator, type Page } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";

/** @param page - Actual owned browser. @param control - Product control to reach by tab order. @returns After native keyboard focus reaches the control. */
async function tabToControl(page: Page, control: Locator): Promise<void> {
  await page.bringToFront();
  await control.waitFor({ state: "visible" });
  await page.evaluate(() => {
    const diagnosticWindow = window as Window & { admissionTabEvents?: Array<{ tag: string | undefined; role: string | null | undefined; prevented: boolean; focused: boolean }> };
    diagnosticWindow.admissionTabEvents = [];
    if (Object.hasOwn(document.documentElement.dataset, "admissionTabObserver")) return;
    document.documentElement.dataset.admissionTabObserver = "";
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const target = event.target instanceof Element ? event.target : null;
      queueMicrotask(() => { diagnosticWindow.admissionTabEvents?.push({ tag: target?.tagName, role: target?.getAttribute("role"), prevented: event.defaultPrevented, focused: document.hasFocus() }); });
    }, true);
  });
  if (await control.evaluate((element) => element === document.activeElement)) return;
  // WebKit can leave page focus when forward traversal wraps after the last disabled/re-enabled control.
  // Reverse traversal exercises native keyboard access without selecting or focusing a target programmatically.
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press(key);
      if (await control.evaluate((element) => element === document.activeElement)) return;
    }
  }
  const diagnostic = await control.evaluate((element) => ({ tag: element.tagName, role: element.getAttribute("role"), name: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80), tabIndex: (element as HTMLElement).tabIndex, disabled: element.matches(":disabled"), connected: element.isConnected, inert: Boolean(element.closest("[inert]")), hiddenAncestor: Boolean(element.closest('[aria-hidden="true"]')), documentFocused: document.hasFocus(), visibility: document.visibilityState, activeTag: document.activeElement?.tagName, activeRole: document.activeElement?.getAttribute("role"), focusableCount: document.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]').length, bodyStyle: { display: getComputedStyle(document.body).display, visibility: getComputedStyle(document.body).visibility }, controls: Array.from(document.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]')).map((control) => ({ tag: control.tagName, role: control.getAttribute("role"), tabIndex: (control as HTMLElement).tabIndex, display: getComputedStyle(control).display, visibility: getComputedStyle(control).visibility, inert: Boolean(control.closest("[inert]")) })) }));
  const tabEvents = await page.evaluate(() => (window as Window & { admissionTabEvents?: Array<{ tag: string | undefined; role: string | null | undefined; prevented: boolean; focused: boolean }> }).admissionTabEvents?.slice(-4) ?? []);
  throw new Error(`Pending keyboard control was not reachable by tab order: ${JSON.stringify(diagnostic)} tabs=${JSON.stringify(tabEvents.slice(-4))}`);
}

/** @param page - Actual owned browser. @param code - Private code delivered by the controlled transport. @returns After keyboard entry, without retaining private instrumentation logs. */
async function typePrivateCode(page: Page, code: string): Promise<void> {
  try { await page.keyboard.type(code); }
  catch { throw new Error("Pending keyboard code entry was unavailable"); }
}

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native pending keyboard flow", () => {
  it.each([{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }])("should apply, query, cancel and open a separate retry with the keyboard on $name at $width", async ({ engine, width }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-pending-keyboard", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionContactVerification(database, false, config, false, undefined, 259_200_000);
      const pendingId = randomUUID(), slug = `issue-${fixture.context.tribeId}`;
      // This is a coherent historical pending snapshot, not a claim of a real
      // two-day-old presentation. Verification and all browser writes happen now.
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public."user" set "createdAt"=policy.activated_at-interval '1 day' from public.academy_admission_policies policy where policy.tribe_id=${fixture.context.tribeId} and id in (${fixture.context.userId},${fixture.fixture.scope.userId})`);
        await transaction.execute(sql`update public.tribes set created_at=policy.activated_at-interval '1 day' from public.academy_admission_policies policy where policy.tribe_id=${fixture.context.tribeId} and id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,original_policy_snapshot,submitted_at,expires_at) select ${pendingId},${fixture.context.tribeId},${fixture.context.userId},'common','none','{"version":1,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":false}'::jsonb,instant.now-interval '2 days',instant.now+interval '28 days' from instant`);
      });
      const originalDates = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at from public.academy_admission_requests where id=${pendingId}`)).rows[0]);
      let receivedCode = "";
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browserServer = await engine.launchServer({ headless: true });
        try {
          const browser = await engine.connect(browserServer.wsEndpoint());
          const context = await browser.newContext({ viewport: { width, height: 900 } });
          try {
            await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
            const page = await context.newPage();
            page.setDefaultTimeout(180_000);
            let pageErrors = 0, issueRequests = 0, applyRequests = 0, cancelRequests = 0, submitRequests = 0, serverComponentRequests = 0;
            page.on("pageerror", () => pageErrors += 1);
            page.on("request", (request) => {
              if (request.headers().rsc === "1") serverComponentRequests += 1;
              if (request.method() !== "POST") return;
              const path = new URL(request.url()).pathname;
              if (path.endsWith("/challenges")) issueRequests += 1;
              if (path.endsWith("/proof")) applyRequests += 1;
              if (path.endsWith("/cancel")) cancelRequests += 1;
              if (path.endsWith("/submissions")) submitRequests += 1;
            });
            await page.goto(`${origin}${buildOwnAdmissionRequestRoute(slug, pendingId)}`, { waitUntil: "networkidle" });
            const originalServerComponents = serverComponentRequests;
            const consent = page.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i });
            try { await expect.poll(() => consent.isEnabled(), { timeout: 180_000 }).toBe(true); }
            catch {
              const alerts = (await page.getByRole("alert").allTextContents()).map((message) => message.trim().slice(0, 180));
              throw new Error(`Pending keyboard consent unavailable: alerts=${JSON.stringify(alerts)} pageErrors=${pageErrors}`);
            }
            await tabToControl(page, consent);
            await page.keyboard.press("Space");
            const issue = page.getByRole("button", { name: "Enviar código de ingreso", exact: true });
            await expect.poll(() => issue.isEnabled(), { timeout: 180_000 }).toBe(true);
            await tabToControl(page, issue);
            await page.keyboard.press("Enter");
            const codeInput = page.getByLabel("Código de ingreso", { exact: true });
            await page.waitForFunction(() => Boolean(document.querySelector('input[autocomplete="one-time-code"]')) || Array.from(document.querySelectorAll('[role="alert"]')).some((element) => element.textContent?.trim()));
            if (await codeInput.count() === 0) {
              const recovery = page.getByRole("button", { name: "Consultar operación del código", exact: true });
              if (await recovery.count() > 0) {
                expect(issueRequests).toBe(1);
                await expect.poll(() => recovery.isEnabled(), { timeout: 180_000 }).toBe(true);
                await tabToControl(page, recovery);
                await page.keyboard.press("Enter");
              }
            }
            try { await codeInput.waitFor({ state: "visible" }); }
            catch {
              const alerts = (await page.getByRole("alert").allTextContents()).map((message) => message.trim().slice(0, 180));
              throw new Error(`Pending keyboard issuance unavailable: issueRequests=${issueRequests} alerts=${JSON.stringify(alerts)} pageErrors=${pageErrors}`);
            }
            await expect.poll(() => /^\d{6}$/u.test(receivedCode), { timeout: 180_000 }).toBe(true);
            await tabToControl(page, codeInput);
            await typePrivateCode(page, receivedCode);
            await tabToControl(page, page.getByRole("button", { name: "Comprobar código", exact: true }));
            await page.keyboard.press("Enter");
            const apply = page.getByRole("button", { name: "Aplicar prueba a esta solicitud", exact: true });
            await apply.waitFor({ state: "visible" });
            await tabToControl(page, apply);
            await page.keyboard.press("Enter");
            // The confirmed write is announced once, in its own toast.
            await page.getByText("La prueba quedó aplicada a tu solicitud pendiente.", { exact: true }).first().waitFor({ state: "visible" });
            const query = page.getByRole("button", { name: "Consultar estado", exact: true });
            await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${fixture.context.tribeId}`));
            await tabToControl(page, query);
            await page.keyboard.press("Enter");
            const currentRestriction = page.getByRole("region", { name: "Estado de tu solicitud", exact: true }).getByRole("status").filter({ hasText: "Por ahora esta solicitud no puede aprobarse porque las admisiones no están disponibles. Su plazo sigue corriendo." });
            await currentRestriction.waitFor({ state: "visible" });
            await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set is_open=true,version=version+1 where tribe_id=${fixture.context.tribeId}`));
            await expect.poll(() => query.isEnabled(), { timeout: 180_000 }).toBe(true);
            await tabToControl(page, query);
            await page.keyboard.press("Enter");
            await currentRestriction.waitFor({ state: "hidden" });
            await expect.poll(() => query.isEnabled(), { timeout: 180_000 }).toBe(true);
            const cancelConsent = page.getByRole("checkbox", { name: /Confirmo que quiero cancelar esta solicitud/i });
            await tabToControl(page, cancelConsent);
            await page.keyboard.press("Space");
            const cancel = page.getByRole("button", { name: "Cancelar solicitud", exact: true });
            await expect.poll(() => cancel.isEnabled(), { timeout: 180_000 }).toBe(true);
            await tabToControl(page, cancel);
            await page.keyboard.press("Enter");
            const retry = page.getByRole("link", { name: "Volver a solicitar ingreso", exact: true });
            await retry.waitFor({ state: "visible" });
            expect(await retry.getAttribute("href")).toBe(`/admissions/${slug}`);
            expect(serverComponentRequests).toBe(originalServerComponents);
            await database.withContext(fixture.own, async (transaction) => {
              expect((await transaction.execute(sql`select status,version,submitted_at,expires_at from public.academy_admission_requests where id=${pendingId}`)).rows).toEqual([{ status: "cancelled", version: 3, ...originalDates }]);
              expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 1 }]);
              expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 0 }]);
            });
            await tabToControl(page, retry);
            await page.keyboard.press("Enter");
            await page.waitForURL(`${origin}/admissions/${slug}`);
            // A new presentation starts at the data step; the keyboard moves on to the code step.
            const next = page.getByRole("button", { name: "Continuar", exact: true });
            await expect.poll(() => next.isEnabled(), { timeout: 180_000 }).toBe(true);
            await tabToControl(page, next);
            await page.keyboard.press("Enter");
            const nextConsent = page.getByRole("checkbox", { name: /Confirmo el contacto y el envío del código/i });
            await nextConsent.waitFor({ state: "visible" });
            expect(await nextConsent.isChecked()).toBe(false);
            await database.withContext(fixture.own, async (transaction) => {
              expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 1 }]);
            });
            expect(issueRequests).toBe(1);
            expect(applyRequests).toBe(1);
            expect(cancelRequests).toBe(1);
            expect(submitRequests).toBe(0);
            expect(pageErrors).toBe(0);
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
          } finally { await context.close(); }
        } finally { await browserServer.close(); }
      }, { messagingSecurity, preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: fixture.fixture.credential, ADMISSION_TEST_ZAVU_SENDER_ID: fixture.fixture.emailSenderId, ADMISSION_TEST_ZAVU_RECIPIENT: fixture.own.email, ADMISSION_TEST_ZAVU_TEST_MODE: "false" }, onDiagnosticCode: (code) => { receivedCode = code; } }));
    });
  }, 1_200_000);
});
