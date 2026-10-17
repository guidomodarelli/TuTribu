/** @vitest-environment node */
/** Exercises actual policy, common/personal collection, own recovery and reviewer UI in both engines. @module admission-whatsapp-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { bindAdmissionBatchBrowserSession } from "@/tests/support/admission-batch-browser-fixture";
import { prepareAdmissionWhatsappBrowser } from "@/tests/support/admission-whatsapp-browser-fixture";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { ADMISSION_WHATSAPP_BROWSER_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-whatsapp-number";
import { ADMISSION_WHATSAPP_COPY as COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { PERSONAL_INVITATION_UI_COPY as PERSONAL_COPY } from "@/src/modules/academy-admissions/constants/personal-invitation-ui";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { buildAdmissionEntryRoute, buildOwnAdmissionRequestRoute, buildAdmissionReviewRoute } from "@/lib/academy-admissions/admission-routes";
import { admissionOutcomeSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";

/** @param page - Actual rendered page. @param name - Synthetic surface identifier. @param privateValues - Native identities and secrets excluded from the capture. @returns After checking mobile sizing and optionally saving actual rendered captures. */
async function inspectSurface(page: Page, name: string, privateValues: string[]): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  const directory = process.env[VALIDATION.captureDirectoryEnvironment];
  if (directory) { await mkdir(directory, { recursive: true }); await page.locator("main:visible").last().screenshot({ path: join(directory, `${name}.png`), timeout: 10_000 }); }
  await captureAdmissionReview(page, `whatsapp-${name}`, privateValues, `whatsapp-${name}-captures.json`);
}

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native declared WhatsApp browser", () => {
  it.concurrent.each([{ engineName: "chromium", engine: chromium }, { engineName: "webkit", engine: webkit }])("should configure, collect, correct, recover and review declared WhatsApp in $engineName at mobile and desktop widths", async ({ engineName, engine }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: VALIDATION.securityEnvironment, securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const security = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionWhatsappBrowser(database, security);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
        for (const width of VALIDATION.widths) {
          const common = await fixture.applicant(`Solicitante de prueba ${engineName} ${width}`), personal = await fixture.applicant(`Invitado de prueba ${engineName} ${width}`);
          await fixture.confirm(REAUTHENTICATION_OPERATION.updateAdmissionPolicy);
          const browser = await engine.launch({ headless: true }), leaderContext = await browser.newContext({ viewport: { width, height: VALIDATION.height } }), applicantContext = await browser.newContext({ viewport: { width, height: VALIDATION.height } });
          const leader = await leaderContext.newPage(), page = await applicantContext.newPage(), failures: string[] = [];
          const privateValues = [secret, fixture.leader.userId, fixture.leader.sessionToken, common.userId, common.sessionToken, personal.userId, personal.sessionToken];
          let documents = 0, commonWrites = 0, correctionWrites = 0;
          for (const surface of [leader, page]) { surface.setDefaultTimeout(VALIDATION.actionTimeoutMs); surface.on("pageerror", (error) => failures.push(error.name)); }
          page.on("request", (request) => { if (request.isNavigationRequest() && request.resourceType() === "document") documents += 1; if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/submissions")) commonWrites += 1; if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/whatsapp")) correctionWrites += 1; });
          try {
            await bindAdmissionBatchBrowserSession(leaderContext, fixture.leader, origin, secret); await bindAdmissionBatchBrowserSession(applicantContext, common, origin, secret);
            await leader.goto(`${origin}/${fixture.slug}/academia/admissions/settings`);
            const requirement = leader.getByRole("checkbox", { name: COPY.policyLabel });
            expect(await requirement.isChecked()).toBe(false); await requirement.check();
            await leader.getByRole("checkbox", { name: "Revisé las reglas y su impacto y quiero confirmar esta acción." }).check();
            const configured = leader.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith("/policy"));
            await leader.getByRole("button", { name: "Guardar configuración", exact: true }).click(); expect((await configured).status()).toBe(200);
            await inspectSurface(leader, `${engineName}-${width}-leader`, privateValues);
            await page.goto(new URL(buildAdmissionEntryRoute(fixture.slug), origin).href);
            expect(await page.getByRole("textbox", { name: /^(Nombre|Apellido)$/i }).count()).toBe(0);
            await page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }).check(); await page.getByRole("button", { name: ADMISSION_UI_COPY.submit, exact: true }).click();
            await page.getByText(COPY.required, { exact: true }).waitFor(); expect(commonWrites).toBe(0);
            const number = page.getByRole("textbox", { name: COPY.label, exact: true });
            await number.fill("invalid"); await page.getByRole("button", { name: ADMISSION_UI_COPY.submit, exact: true }).click();
            await page.getByText(COPY.invalid, { exact: true }).waitFor(); expect(commonWrites).toBe(0);
            await number.fill("+1 (415) 555-2671"); await number.press("Tab");
            await inspectSurface(page, `${engineName}-${width}-common`, privateValues);
            await page.getByRole("button", { name: ADMISSION_UI_COPY.submit, exact: true }).click();
            await page.getByRole("link", { name: "Ver solicitud", exact: true }).waitFor(); expect(commonWrites).toBe(1);
            const request = await database.withContext({ userId: common.userId, email: common.email }, async (transaction) => (await transaction.execute<{ id: string }>(sql`select id,source,status,version,contact_type,normalized_contact,evidence_source,submitted_at,expires_at from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${common.userId}`)).rows[0]);
            let dropped = false;
            await page.route("**/requests/*/whatsapp", async (route) => { if (route.request().method() === "POST" && !dropped) { dropped = true; const response = await runPrivateBrowserRequest("receive_synthetic_whatsapp_reply", () => route.fetch()); expect(response.status()).toBe(200); await route.abort(); } else await route.continue(); });
            await page.getByRole("textbox", { name: COPY.label, exact: true }).fill("+44 20 7946 0018");
            await page.getByRole("checkbox", { name: COPY.confirmEdit }).check(); await page.getByRole("button", { name: COPY.save, exact: true }).click();
            await page.getByText(ADMISSION_UI_COPY.uncertain, { exact: true }).waitFor();
            await page.getByRole("button", { name: ADMISSION_UI_COPY.read, exact: true }).click(); await page.getByText(COPY.saved, { exact: true }).waitFor();
            expect(correctionWrites).toBe(1); expect(documents).toBe(1);
            await page.getByRole("link", { name: "Ver solicitud", exact: true }).click(); await page.waitForURL(new URL(buildOwnAdmissionRequestRoute(fixture.slug, request.id), origin).href);
            await page.getByRole("textbox", { name: COPY.label, exact: true }).waitFor({ state: "visible" });
            await applicantContext.route("**/api/auth/get-session**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "INTERNAL_SERVER_ERROR", message: "Synthetic native account observation interruption" }) }));
            await page.goBack(); await page.getByText(ADMISSION_UI_COPY.readFailed, { exact: true }).waitFor();
            expect(await page.getByRole("textbox", { name: COPY.label, exact: true }).count()).toBe(0);
            await applicantContext.unroute("**/api/auth/get-session**"); await page.getByRole("button", { name: ADMISSION_UI_COPY.read, exact: true }).click();
            await page.getByRole("textbox", { name: COPY.label, exact: true }).waitFor({ state: "visible" });
            expect(correctionWrites).toBe(1);
            await inspectSurface(page, `${engineName}-${width}-own`, privateValues);
            await leader.goto(new URL(buildAdmissionReviewRoute(fixture.slug, request.id), origin).href);
            await leader.locator("dd").filter({ hasText: "+442079460018" }).waitFor(); expect(await leader.getByText(common.name, { exact: true }).count()).toBeGreaterThan(0); await leader.getByText(COPY.declared, { exact: true }).waitFor();
            await inspectSurface(leader, `${engineName}-${width}-review`, privateValues);
            const invitations = new PostgresPersonalInvitationRepository((_scope, run) => database.withContext(fixture.own, run), async () => fixture.config);
            const invitation = await invitations.create({ context: { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" }, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: personal.email }, internalName: "Invitación de prueba", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
            if (invitation.state !== "completed" || !invitation.initialToken) throw new Error("Synthetic personal WhatsApp invitation did not complete");
            await applicantContext.clearCookies(); await bindAdmissionBatchBrowserSession(applicantContext, personal, origin, secret);
            await runPrivateBrowserRequest("open_synthetic_whatsapp_invitation", () => page.goto(`${origin}/admissions/invitations/${invitation.initialToken}`));
            await page.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/ }).check(); await page.getByRole("button", { name: "Confirmar invitación", exact: true }).click();
            await page.getByText(COPY.required, { exact: true }).waitFor(); expect(commonWrites).toBe(1);
            await page.getByRole("textbox", { name: COPY.label, exact: true }).fill("+1 (415) 555-2671");
            await page.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/ }).check(); await inspectSurface(page, `${engineName}-${width}-personal`, [...privateValues, invitation.initialToken]);
            await page.getByRole("link", { name: PERSONAL_COPY.common, exact: true }).click(); await page.waitForURL(new URL(buildAdmissionEntryRoute(fixture.slug), origin).href);
            await page.getByRole("textbox", { name: COPY.label, exact: true }).waitFor({ state: "visible" });
            await applicantContext.route("**/api/auth/get-session**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "INTERNAL_SERVER_ERROR", message: "Synthetic personal account observation interruption" }) }));
            await runPrivateBrowserRequest("return_to_synthetic_whatsapp_invitation", () => page.goBack()); await page.getByRole("alert").waitFor();
            expect(await page.getByRole("textbox", { name: COPY.label, exact: true }).count()).toBe(0);
            await applicantContext.unroute("**/api/auth/get-session**"); await page.getByRole("button", { name: PERSONAL_COPY.read, exact: true }).click();
            await page.getByRole("textbox", { name: COPY.label, exact: true }).waitFor({ state: "visible" });
            await page.getByRole("textbox", { name: COPY.label, exact: true }).fill("+1 (415) 555-2671");
            await page.getByRole("checkbox", { name: PERSONAL_COPY.confirm }).check();
            const personalResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/submissions"));
            await page.getByRole("button", { name: "Confirmar invitación", exact: true }).click();
            await page.getByRole("link", { name: PERSONAL_COPY.ownRequest, exact: true }).waitFor(); expect(commonWrites).toBe(2);
            const personalOutcome = admissionOutcomeSchema.parse(await (await personalResponse).json());
            if (personalOutcome.outcome !== "pending") throw new Error("Synthetic personal WhatsApp presentation did not confirm its pending result");
            await leader.goto(`${origin}/${fixture.slug}/academia/admissions/settings`); await leader.getByRole("checkbox", { name: COPY.policyLabel }).uncheck();
            await leader.getByRole("checkbox", { name: "Revisé las reglas y su impacto y quiero confirmar esta acción." }).check();
            const optional = leader.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith("/policy"));
            await leader.getByRole("button", { name: "Guardar configuración", exact: true }).click(); expect((await optional).status()).toBe(200);
            expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select requires_whatsapp_number,requires_additional_verification,verification_epoch from public.academy_admission_policies where tribe_id=${fixture.tribeId}`)).rows)).toEqual([{ requires_whatsapp_number: false, requires_additional_verification: false, verification_epoch: 1 }]);
            expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,source,status,version,contact_type,normalized_contact,evidence_source,submitted_at,expires_at,whatsapp_number from public.academy_admission_requests where id=${request.id}`)).rows)).toEqual([{ ...request, version: 2, whatsapp_number: "+442079460018" }]);
            const personalRows = await database.withContext({ userId: personal.userId, email: personal.email }, async (transaction) => (await transaction.execute(sql`select source,status,version,contact_type,normalized_contact,whatsapp_number from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${personal.userId}`)).rows);
            const evidenceDirectory = process.env[VALIDATION.captureDirectoryEnvironment];
            if (evidenceDirectory) await writeFile(join(evidenceDirectory, `${engineName}-${width}.persistence.json`), JSON.stringify({ committedVersion: personalOutcome.request.version, rows: personalRows.map((row) => ({ source: row.source, status: row.status, version: row.version, contactType: row.contact_type, contactMatchesAccount: row.normalized_contact === personal.email, declaredNumberMatches: row.whatsapp_number === "+14155552671" })) }));
            // Existing Google-backed redemption claims the primary email in its own second version.
            expect(personalOutcome.request.version).toBe(2);
            expect(personalRows).toEqual([{ source: "personal", status: "pending", version: personalOutcome.request.version, contact_type: "email", normalized_contact: personal.email, whatsapp_number: "+14155552671" }]);
            expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id in (${common.userId},${personal.userId})) as memberships`)).rows)).toEqual([{ deliveries: 0, memberships: 0 }]);
            expect(failures).toEqual([]);
            const progress = { stage: "whatsapp_views_passed", engine: engineName, width, surfaces: 5, sends: 0, submissionPosts: commonWrites, correctionPosts: correctionWrites };
            const directory = process.env[VALIDATION.captureDirectoryEnvironment];
            if (directory) await writeFile(join(directory, `${engineName}-${width}.passed.json`), JSON.stringify(progress));
            process.stdout.write(JSON.stringify(progress) + "\n");
          } catch (error) {
            const directory = process.env[VALIDATION.captureDirectoryEnvironment];
            if (directory) {
              try { await page.screenshot({ path: join(directory, `${engineName}-${width}-failure-page.png`), timeout: 5_000 }); await leader.screenshot({ path: join(directory, `${engineName}-${width}-failure-leader.png`), timeout: 5_000 }); }
              catch { process.stdout.write(JSON.stringify({ stage: "optional_failure_capture_unavailable", engine: engineName, width }) + "\n"); }
            }
            throw error;
          } finally { await applicantContext.close(); await leaderContext.close(); await browser.close(); }
        }
      }, { messagingSecurity }));
    });
  }, VALIDATION.timeoutMs);
});
