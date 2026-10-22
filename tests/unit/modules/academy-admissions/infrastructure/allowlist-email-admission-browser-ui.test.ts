/** @vitest-environment node */
/** Exercises the real rules page switching an active policy to the allowlist with email contact and codes OFF, then listed and unlisted applicants, in both engines. @module allowlist-email-admission-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { bindAdmissionBatchBrowserSession } from "@/tests/support/admission-batch-browser-fixture";
import { prepareAdmissionWhatsappBrowser } from "@/tests/support/admission-whatsapp-browser-fixture";
import { continueToAdmissionSubmission } from "@/tests/support/admission-contact-browser-actions";
import { settleGuidedStep } from "@/tests/support/guided-steps-browser";
import { setVisibleCheckboxChecked } from "@/tests/support/set-visible-checkbox";
import { ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { buildAdmissionEntryRoute } from "@/lib/academy-admissions/admission-routes";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";

const BROWSER_SURFACES = [
  { name: "chromium", engine: chromium, width: 1280 },
  { name: "chromium", engine: chromium, width: 390 },
  { name: "webkit", engine: webkit, width: 1280 },
  { name: "webkit", engine: webkit, width: 390 },
] as const;
const VIEWPORT_HEIGHT = 900;
const ACTION_TIMEOUT_MS = 180_000;
const SUITE_TIMEOUT_MS = 3_600_000;
const ALLOWLIST_MODE_LABEL = "Lista de habilitados";
const CONFIRMATION_LABEL = "Revisé las reglas y quiero guardar los cambios.";
const SAVE_LABEL = "Guardar cambios";
const RULES_SAVED_LABEL = "Los cambios en las reglas quedaron guardados.";
const STATUS_READING_LABEL = "Consultando estado…";

/** @param page - Owned leader page on the rules route. @returns Once the rules editor reached its review step. */
async function walkToReview(page: Page) {
  const next = page.getByRole("button", { name: "Continuar", exact: true });
  while (await page.getByRole("checkbox", { name: CONFIRMATION_LABEL, exact: true }).count() === 0) { await next.click(); await settleGuidedStep(page); }
}

/** @param page - Owned applicant page. @returns Once its own status read settled, so leaving the page aborts no request. */
async function settleStatusRead(page: Page) {
  await page.getByText(STATUS_READING_LABEL, { exact: true }).waitFor({ state: "hidden" });
}

/** @param path - Own submission or policy endpoint. @returns Whether it names that endpoint. */
const isSubmission = (path: string) => path.endsWith("/submissions");

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native list admission with codes OFF and email contact", () => {
  it("should switch active rules to the list and admit a listed Google email on submission while leaving an unlisted one without request or membership across Chromium/WebKit at desktop/mobile widths", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-allowlist-email-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionWhatsappBrowser(database, config);
      // One listed Google account per surface, loaded in Habilitados before the leader switches the rules.
      const listed: Awaited<ReturnType<typeof fixture.applicant>>[] = [];
      for (const { name, width } of BROWSER_SURFACES) {
        const applicant = await fixture.applicant(`Habilitado de prueba ${name} ${width}`);
        const created = await fixture.writer.create({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry), operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, displayName: null });
        expect(created.state).toBe("completed");
        listed.push(applicant);
      }
      /** @returns The persisted mode, contact, code switch and version, read as the owner. */
      const readPolicy = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ mode: string; contact_type: string; requires_additional_verification: boolean; allow_common_exceptions: boolean; version: number }>(sql`select mode,contact_type,requires_additional_verification,allow_common_exceptions,version from public.academy_admission_policies where tribe_id=${fixture.tribeId}`)).rows[0]);
      /** @param userId - Synthetic applicant. @returns Its requests and memberships in this academy. */
      const readApplicant = (userId: string) => database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ requests: { status: string; source: string }[] | null; memberships: { status: string; role: string }[] | null }>(sql`select (select jsonb_agg(jsonb_build_object('status',request.status,'source',request.source)) from public.academy_admission_requests request where request.tribe_id=${fixture.tribeId} and request.user_id=${userId}) as requests,(select jsonb_agg(jsonb_build_object('status',member.status,'role',member.role)) from public.tribe_members member where member.tribe_id=${fixture.tribeId} and member.user_id=${userId}) as memberships`)).rows[0]);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
        for (const [index, { name, engine, width }] of BROWSER_SURFACES.entries()) {
          console.info(JSON.stringify({ phase: "allowlist_email_ui_start", engine: name, width }));
          // Each surface starts from active manual review, so every engine and width saves the switch itself.
          await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode=${ADMISSION_POLICY_MODE.manualReview},version=version+1,updated_at=clock_timestamp() where tribe_id=${fixture.tribeId} and mode<>${ADMISSION_POLICY_MODE.manualReview}`));
          const unlisted = await fixture.applicant(`Fuera de la lista ${name} ${width}`), member = listed[index];
          const browser = await engine.launch({ headless: true });
          const leaderContext = await browser.newContext({ viewport: { width, height: VIEWPORT_HEIGHT } }), applicantContext = await browser.newContext({ viewport: { width, height: VIEWPORT_HEIGHT } }), outsiderContext = await browser.newContext({ viewport: { width, height: VIEWPORT_HEIGHT } });
          const leader = await leaderContext.newPage(), page = await applicantContext.newPage(), outsider = await outsiderContext.newPage(), pageErrors: string[] = [];
          let submissions = 0;
          for (const surface of [leader, page, outsider]) { surface.setDefaultTimeout(ACTION_TIMEOUT_MS); surface.on("pageerror", (error) => pageErrors.push(`${error.name}: ${error.message.split(" http", 1)[0]}`)); }
          for (const surface of [page, outsider]) surface.on("request", (request) => { if (request.method() === "POST" && isSubmission(new URL(request.url()).pathname)) submissions += 1; });
          try {
            await bindAdmissionBatchBrowserSession(leaderContext, fixture.leader, origin, secret);
            const before = await readPolicy();
            expect(before).toMatchObject({ mode: ADMISSION_POLICY_MODE.manualReview, contact_type: "email", requires_additional_verification: false, allow_common_exceptions: false });
            await leader.goto(`${origin}/${fixture.slug}/${ADMISSION_POLICY_SETTINGS_SEGMENT}`, { waitUntil: "domcontentloaded" });
            await leader.getByRole("button", { name: "Editar reglas", exact: true }).click(); await settleGuidedStep(leader);
            await leader.getByRole("radio", { name: ALLOWLIST_MODE_LABEL, exact: true }).click();
            await walkToReview(leader);
            await setVisibleCheckboxChecked(leader.getByRole("checkbox", { name: CONFIRMATION_LABEL, exact: true }), true, ACTION_TIMEOUT_MS);
            const saved = leader.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith("/policy"));
            await leader.getByRole("button", { name: SAVE_LABEL, exact: true }).click();
            expect((await saved).status()).toBe(HTTP_STATUS.ok);
            await leader.getByRole("button", { name: "Editar reglas", exact: true }).waitFor({ state: "visible" });
            await leader.getByText(RULES_SAVED_LABEL, { exact: true }).first().waitFor({ state: "visible" });
            expect(await readPolicy()).toEqual({ ...before, mode: ADMISSION_POLICY_MODE.allowlist, version: before.version + 1 });
            expect(await leader.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

            // A listed Google email becomes a member only when it sends its request.
            await bindAdmissionBatchBrowserSession(applicantContext, member, origin, secret);
            await page.goto(new URL(buildAdmissionEntryRoute(fixture.slug), origin).href);
            await continueToAdmissionSubmission(page);
            expect(await readApplicant(member.userId)).toEqual({ requests: null, memberships: null });
            await setVisibleCheckboxChecked(page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }), true, ACTION_TIMEOUT_MS);
            const listedReply = page.waitForResponse((response) => response.request().method() === "POST" && isSubmission(new URL(response.url()).pathname));
            await page.getByRole("button", { name: ADMISSION_UI_COPY.submit, exact: true }).click();
            const listedResponse = await listedReply;
            expect(listedResponse.status()).toBe(HTTP_STATUS.created);
            expect(await readApplicant(member.userId)).toEqual({ requests: [{ status: "approved", source: "common" }], memberships: [{ status: "active", role: "tribemate" }] });
            await settleStatusRead(page);
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

            // An unlisted Google email, in its own browser session, leaves neither a request nor a membership.
            await bindAdmissionBatchBrowserSession(outsiderContext, unlisted, origin, secret);
            await outsider.goto(new URL(buildAdmissionEntryRoute(fixture.slug), origin).href);
            await continueToAdmissionSubmission(outsider);
            await setVisibleCheckboxChecked(outsider.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }), true, ACTION_TIMEOUT_MS);
            const unlistedReply = outsider.waitForResponse((response) => response.request().method() === "POST" && isSubmission(new URL(response.url()).pathname));
            await outsider.getByRole("button", { name: ADMISSION_UI_COPY.submit, exact: true }).click();
            const unlistedResponse = await unlistedReply;
            expect(unlistedResponse.status()).toBe(HTTP_STATUS.conflict);
            expect((await unlistedResponse.json() as { code: string }).code).toBe(ADMISSION_ERROR_CODE.admissionIneligible);
            await outsider.getByRole("alert").filter({ hasText: ADMISSION_ERROR_MESSAGE.admission_ineligible }).first().waitFor({ state: "visible" });
            expect(submissions).toBe(2);
            await settleStatusRead(outsider);
            expect(await readApplicant(unlisted.userId)).toEqual({ requests: null, memberships: null });
            expect(await outsider.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
            expect(pageErrors).toEqual([]);
            console.info(JSON.stringify({ phase: "allowlist_email_ui_complete", engine: name, width }));
          } catch (error) {
            console.info(JSON.stringify({ phase: "allowlist_email_ui_failure", engine: name, width, leader: (await leader.locator("main:visible").last().innerText().catch(() => "")).slice(0, 800), applicant: (await page.locator("main:visible").last().innerText().catch(() => "")).slice(0, 800), outsider: (await outsider.locator("main:visible").last().innerText().catch(() => "")).slice(0, 800) }));
            throw error;
          } finally { try { await outsiderContext.close(); await applicantContext.close(); } finally { try { await leaderContext.close(); } finally { await browser.close(); } } }
        }
      }, { messagingSecurity }));
    });
  }, SUITE_TIMEOUT_MS);
});
