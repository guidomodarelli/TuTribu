/** @vitest-environment node */
/** Exercises historical arrival through the actual SSR/browser/common owner on both engines. @module academy-legacy-admission-bridges-tests */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { buildLegacyAdmissionEntryRoute } from "@/lib/academy-admissions/admission-routes";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_REQUEST_SOURCE, ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { LEGACY_ADMISSION_TOKEN_BYTE_LENGTH } from "@/tests/support/constants/legacy-admission-entry";
import { continueToAdmissionSubmission } from "@/tests/support/admission-contact-browser-actions";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native historical academy arrival", () => {
  it("should route academy, history and historical invitation entry through common policy while rejecting direct paid flags on Chromium/WebKit desktop and mobile", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-historical-arrival-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const { fixture, applicant } = await prepareAllowlistAdmission(database, config);
      const token = randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64url"), invitationId = randomUUID();
      const slug = await database.withContext(fixture.own, async (transaction) => {
        const integrationId = randomUUID();
        await transaction.execute(sql`insert into public.tribe_payment_integrations(id,tribe_id,provider,account_label,status,access_token,token_expires_at,connected_by) values (${integrationId},${fixture.tribeId},'mercado_pago','Cuenta de ejemplo','connected',${randomUUID()},clock_timestamp()+interval '1 day',${fixture.userId})`);
        await transaction.execute(sql`insert into public.tribe_subscription_prices(id,tribe_id,name,amount_cents,currency,frequency,status,is_current,mercado_pago_preapproval_plan_id,payment_integration_id,product_key,created_by) values (${randomUUID()},${fixture.tribeId},'Membresía de ejemplo',1500,'ARS','monthly','active',true,${randomUUID()},${integrationId},'membership',${fixture.userId})`);
        await transaction.execute(sql`update public.tribes set free_join_is_current=false where id=${fixture.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set mode=${ADMISSION_POLICY_MODE.manualReview},version=version+1 where tribe_id=${fixture.tribeId}`);
        await transaction.execute(sql`insert into public.tribe_invitations(id,tribe_id,token_hash,created_by,status,created_at) values (${invitationId},${fixture.tribeId},${createHash("sha256").update(token).digest("hex")},${fixture.userId},'active',clock_timestamp())`);
        return (await transaction.execute<{ slug: string }>(sql`select slug from public.tribes where id=${fixture.tribeId}`)).rows[0].slug;
      });
      let providerRequests = 0;
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        for (const { name, engine, width } of [{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }]) {
          const recipient = await applicant(false), session = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ token: string }>(sql`select token from public.session where id=${recipient.sessionId}`)).rows[0]);
          const browser = await engine.launch({ headless: true });
          try {
            const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
            const path = buildLegacyAdmissionEntryRoute(slug, token), forbidden = [token, secret, session.token, recipient.userId, recipient.email];
            let submissions = 0, codes = 0, hydrationErrors = 0;
            page.on("request", (request) => { const pathname = new URL(request.url()).pathname; if (request.method() === "POST" && pathname.endsWith("/admissions/submissions")) submissions += 1; if (request.method() === "POST" && pathname.endsWith("/challenges")) codes += 1; });
            page.on("console", (message) => { if (message.type() === "error" && /hydration|hydrating/iu.test(message.text())) hydrationErrors += 1; });
            await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
            await page.getByRole("link", { name: "Iniciar sesión", exact: true }).waitFor({ state: "visible" });
            const login = await page.getByRole("link", { name: "Iniciar sesión", exact: true }).getAttribute("href");
            expect(Boolean(login && new URL(login, origin).searchParams.get("callbackUrl") === path)).toBe(true);
            expect(submissions).toBe(0); expect(codes).toBe(0);
            if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "legacy-sign-in", forbidden, "legacy-admission-entry-captures.json");
            const value = `${session.token}.${await makeSignature(session.token, secret)}`;
            await context.addCookies([{ name: "better-auth.session_token", value, url: origin, httpOnly: true, sameSite: "Lax" }]);
            await page.goto(`${origin}/${encodeURIComponent(slug)}/academia`, { waitUntil: "domcontentloaded" });
            const academyEntry = page.getByRole("link", { name: "Solicitar ingreso", exact: true });
            await academyEntry.waitFor({ state: "visible" });
            expect(await academyEntry.getAttribute("href")).toBe(`/admissions/${slug}`);
            expect(await page.getByRole("button", { name: "Ingresar gratis", exact: true }).count()).toBe(0);
            if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "academy-common-entry", forbidden, "academy-open-entry-captures.json");
            await academyEntry.click();
            await page.waitForURL((url) => url.pathname === `/admissions/${slug}`, { waitUntil: "domcontentloaded" });
            expect(submissions).toBe(0); expect(codes).toBe(0);
            await page.goto(`${origin}/${encodeURIComponent(slug)}/historia`, { waitUntil: "domcontentloaded" });
            expect(await page.locator('form button[type="submit"]').count()).toBe(0);
            if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "academy-history-closed-entry", forbidden, "academy-open-entry-captures.json");
            const academyJoin = `${origin}/api/tribes/${encodeURIComponent(slug)}/academy/join`;
            const subscriptionStart = `${origin}/api/tribes/${encodeURIComponent(slug)}/subscriptions/start`;
            for (const data of [{}, { paid: true }, { role: "leader" }, { invitationToken: token }]) {
              const response = await context.request.post(academyJoin, { data, headers: { origin } });
              expect(response.status()).toBe(400);
            }
            expect((await context.request.post(subscriptionStart, { data: { paid: true }, headers: { origin } })).status()).toBe(400);
            expect((await context.request.post(subscriptionStart, { data: { invitationToken: token }, headers: { origin } })).status()).toBe(400);
            expect(providerRequests).toBe(0);
            await database.withContext(fixture.own, async (transaction) => {
              expect((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([]);
              expect((await transaction.execute(sql`select id from public.tribe_member_subscriptions where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([]);
            });
            await page.goto(`${origin}/${encodeURIComponent(slug)}/invitar/${encodeURIComponent(token)}`, { waitUntil: "domcontentloaded" });
            await page.getByRole("button", { name: "Comenzar", exact: true }).click();
            await page.waitForURL((url) => url.pathname === path, { waitUntil: "domcontentloaded" });
            await continueToAdmissionSubmission(page);
            const confirmation = page.getByRole("checkbox", { name: "Confirmo que quiero solicitar ingreso a esta academia", exact: true });
            await confirmation.waitFor({ state: "visible" });
            await page.waitForFunction(() => Array.from(document.querySelectorAll('button[role="checkbox"],input[type="checkbox"]')).some((element) => !element.hasAttribute("disabled")));
            expect(submissions).toBe(0); expect(codes).toBe(0);
            expect((await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows)).length).toBe(0);
            if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "legacy-before-submit", forbidden, "legacy-admission-entry-captures.json");
            await confirmation.click();
            await page.getByRole("button", { name: "Solicitar ingreso", exact: true }).click();
            await page.getByRole("heading", { name: "Tu solicitud de ingreso", exact: true }).waitFor({ state: "visible" });
            expect(submissions).toBe(1); expect(codes).toBe(0); expect(hydrationErrors).toBe(0);
            await database.withContext(fixture.own, async (transaction) => {
              expect((await transaction.execute(sql`select status,source,legacy_invitation_id from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ status: ADMISSION_REQUEST_STATUS.pending, source: ADMISSION_REQUEST_SOURCE.legacy, legacy_invitation_id: invitationId }]);
              expect((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([]);
            });
            expect(await page.evaluate((material) => Object.values(sessionStorage).some((stored) => stored.includes(material)), token)).toBe(false);
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
            if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "legacy-pending", forbidden, "legacy-admission-entry-captures.json");
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.getByRole("heading", { name: "Tu solicitud de ingreso", exact: true }).waitFor({ state: "visible" });
            expect(submissions).toBe(1);
            await context.close();
          } finally { await browser.close(); }
        }
      }, { messagingSecurity, preloadModules: [resolve("tests/support/native-admission-checkout-provider-transport.mjs")], onProviderRequest: () => { providerRequests += 1; } }));
    });
  }, 600_000);
});
