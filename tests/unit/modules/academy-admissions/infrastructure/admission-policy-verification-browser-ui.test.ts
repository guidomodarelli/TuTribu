/** @vitest-environment node */
/** Exercises the real rules page turning contact codes ON and OFF on an active policy, including a stale version, in both engines. @module admission-policy-verification-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { bindAdmissionBatchBrowserSession } from "@/tests/support/admission-batch-browser-fixture";
import { prepareAdmissionWhatsappBrowser } from "@/tests/support/admission-whatsapp-browser-fixture";
import { settleGuidedStep } from "@/tests/support/guided-steps-browser";
import { ADMISSION_POLICY_BROWSER_COPY, ADMISSION_POLICY_DESTINATION_COPY, ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

const BROWSER_SURFACES = [
  { name: "chromium", engine: chromium, width: 1280 },
  { name: "chromium", engine: chromium, width: 390 },
  { name: "webkit", engine: webkit, width: 1280 },
  { name: "webkit", engine: webkit, width: 390 },
] as const;
const ACTION_TIMEOUT_MS = 180_000;
const SUITE_TIMEOUT_MS = 1_800_000;
const VERIFICATION_LABEL = "Comprobar el contacto con un código";
const CONFIRMATION_LABEL = "Revisé las reglas y quiero guardar los cambios.";
const SAVE_LABEL = "Guardar cambios";
const WHATSAPP_LABEL = ADMISSION_WHATSAPP_COPY.policyLabel;

/** @param page - Owned page on the rules route. @returns Once the editor reached its review step through keyboard-free real clicks. */
async function walkToReview(page: Page) {
  const next = page.getByRole("button", { name: "Continuar", exact: true });
  while (await page.getByRole("checkbox", { name: CONFIRMATION_LABEL, exact: true }).count() === 0) { await next.click(); await settleGuidedStep(page); }
}

/** @param page - Owned page. @returns Once the rules editor is open at its contact step. */
async function openContactStep(page: Page) {
  await page.getByRole("button", { name: "Editar reglas", exact: true }).click(); await settleGuidedStep(page);
  await page.getByRole("button", { name: "Continuar", exact: true }).click(); await settleGuidedStep(page);
  await page.getByRole("checkbox", { name: VERIFICATION_LABEL, exact: true }).waitFor({ state: "visible" });
}

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native rules page contact verification ON/OFF", () => {
  it("should require a fresh confirmation after a concurrent change and deny ON without a prepared channel and save OFF across Chromium/WebKit at desktop/mobile widths", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-policy-verification-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionWhatsappBrowser(database, config);
      /** @returns The persisted verification switch and version, read as the owner. */
      const readPolicy = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ requires_additional_verification: boolean; version: number }>(sql`select requires_additional_verification,version from public.academy_admission_policies where tribe_id=${fixture.tribeId}`)).rows[0]);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
        for (const { name, engine, width } of BROWSER_SURFACES) {
          console.info(JSON.stringify({ phase: "policy_verification_ui_start", engine: name, width }));
          const browser = await engine.launch({ headless: true }), context = await browser.newContext({ viewport: { width, height: 900 } });
          await bindAdmissionBatchBrowserSession(context, fixture.leader, origin, secret);
          const page = await context.newPage(), pageErrors: string[] = [], writes: { expectedVersion: number; operationId: string; requiresAdditionalVerification: boolean }[] = [];
          let routeNavigations = 0;
          page.setDefaultTimeout(ACTION_TIMEOUT_MS);
          page.on("pageerror", (error) => pageErrors.push(error.name));
          page.on("request", (request) => {
            if (request.isNavigationRequest() && request.frame() === page.mainFrame()) routeNavigations += 1;
            if (request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/policy")) { const body = request.postDataJSON(); writes.push({ expectedVersion: body.expectedVersion, operationId: body.operationId, requiresAdditionalVerification: body.requiresAdditionalVerification }); }
          });
          try {
            const before = await readPolicy();
            expect(before.requires_additional_verification).toBe(false);
            await page.goto(`${origin}/${fixture.slug}/${ADMISSION_POLICY_SETTINGS_SEGMENT}`, { waitUntil: "domcontentloaded" });
            await openContactStep(page);
            await page.getByRole("checkbox", { name: VERIFICATION_LABEL, exact: true }).click();
            await walkToReview(page);
            // Another leader session changes the same policy while this draft is open.
            await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_whatsapp_number=not requires_whatsapp_number,version=version+1,updated_at=clock_timestamp() where tribe_id=${fixture.tribeId}`));
            await page.getByRole("checkbox", { name: CONFIRMATION_LABEL, exact: true }).click();
            await page.getByRole("button", { name: SAVE_LABEL, exact: true }).click();
            await page.getByRole("alert").filter({ hasText: "La configuración cambió" }).waitFor({ state: "visible" });
            await page.getByRole("button", { name: "Reintentar", exact: true }).click();
            await page.getByText(ADMISSION_POLICY_BROWSER_COPY.changedMeanwhile, { exact: true }).waitFor({ state: "visible" });
            expect(await page.getByRole("checkbox", { name: CONFIRMATION_LABEL, exact: true }).isChecked()).toBe(false);
            expect((await readPolicy()).requires_additional_verification).toBe(false);
            await page.getByRole("checkbox", { name: CONFIRMATION_LABEL, exact: true }).click();
            await page.getByRole("button", { name: SAVE_LABEL, exact: true }).click();
            // Codes stay closed without a prepared channel: the denial names Conexión and nothing is stored.
            await page.getByText(ADMISSION_POLICY_BROWSER_COPY.saveIneligible, { exact: true }).waitFor({ state: "visible" });
            await page.getByRole("link", { name: ADMISSION_POLICY_DESTINATION_COPY.connection, exact: true }).first().waitFor({ state: "visible" });
            const afterDenial = await readPolicy();
            expect(afterDenial.requires_additional_verification).toBe(false);
            expect(writes.slice(-2).map((write) => write.expectedVersion)).toEqual([before.version, before.version + 1]);
            expect(writes.at(-2)!.operationId).not.toBe(writes.at(-1)!.operationId);

            // Turning codes OFF again keeps the draft and saves it as a real change over the concurrent edit.
            await page.goto(`${origin}/${fixture.slug}/${ADMISSION_POLICY_SETTINGS_SEGMENT}`, { waitUntil: "domcontentloaded" });
            await openContactStep(page);
            expect(await page.getByRole("checkbox", { name: VERIFICATION_LABEL, exact: true }).isChecked()).toBe(false);
            await page.getByRole("checkbox", { name: WHATSAPP_LABEL, exact: true }).click();
            await walkToReview(page);
            await page.getByRole("checkbox", { name: CONFIRMATION_LABEL, exact: true }).click();
            await page.getByRole("button", { name: SAVE_LABEL, exact: true }).click();
            await expect.poll(async () => (await readPolicy()).version, { timeout: ACTION_TIMEOUT_MS }).toBe(afterDenial.version + 1);
            expect((await readPolicy()).requires_additional_verification).toBe(false);
            expect(writes.at(-1)!.requiresAdditionalVerification).toBe(false);
            expect(routeNavigations).toBe(2); expect(pageErrors).toEqual([]);
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
            console.info(JSON.stringify({ phase: "policy_verification_ui_complete", engine: name, width }));
          } finally { await context.close(); await browser.close(); }
        }
      }, { messagingSecurity }));
    });
  }, SUITE_TIMEOUT_MS);
});
