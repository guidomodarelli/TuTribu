/** @vitest-environment node */
/** Exercises historical arrival through the actual SSR/browser/common owner on both engines. @module academy-legacy-admission-bridges-tests */
import { createHash, randomBytes, randomUUID } from "node:crypto";
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

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native historical academy arrival", () => {
  it("should preserve login return and explicit common submission without GET effects, token storage or automatic membership on Chromium/WebKit desktop and mobile", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-historical-arrival-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const { fixture, applicant } = await prepareAllowlistAdmission(database, config);
      for (const migration of ["20261011143000_read_locked_legacy_admission_arrival.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261008220000_scope_admission_operation_recovery.sql", "20261008230000_read_admission_contact_choices.sql"]) await database.applyMigration(migration);
      const token = randomBytes(LEGACY_ADMISSION_TOKEN_BYTE_LENGTH).toString("base64url"), invitationId = randomUUID();
      const slug = await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set mode=${ADMISSION_POLICY_MODE.manualReview},version=version+1 where tribe_id=${fixture.tribeId}`);
        await transaction.execute(sql`insert into public.tribe_invitations(id,tribe_id,token_hash,created_by,status,created_at) values (${invitationId},${fixture.tribeId},${createHash("sha256").update(token).digest("hex")},${fixture.userId},'active',clock_timestamp())`);
        return (await transaction.execute<{ slug: string }>(sql`select slug from public.tribes where id=${fixture.tribeId}`)).rows[0].slug;
      });
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
            await page.goto(`${origin}/${encodeURIComponent(slug)}/invitar/${encodeURIComponent(token)}`, { waitUntil: "domcontentloaded" });
            await page.getByRole("button", { name: "Comenzar", exact: true }).click();
            await page.waitForURL((url) => url.pathname === path, { waitUntil: "domcontentloaded" });
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
      }, { messagingSecurity }));
    });
  }, 600_000);
});
