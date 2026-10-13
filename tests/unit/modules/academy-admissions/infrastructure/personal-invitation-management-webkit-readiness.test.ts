/** @vitest-environment node */
/** Reproduces actual WebKit administrative readiness with native auth and no request interception. @module personal-invitation-management-webkit-readiness-tests */
import { webkit, type BrowserContext } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalInvitationManagementDatabase } from "@/tests/support/personal-invitation-management-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { personalInvitationManagementPageStateSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-management-page";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native WebKit personal management readiness", () => {
  it("should finish the authenticated administrative form without creating a personal resource", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePersonalInvitationManagementDatabase(database), slug = `allowlist-${fixture.tribeId}`;
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '1 hour' where id=${fixture.sessionId}`));
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browser = await webkit.launch({ headless: true });
        let context: BrowserContext | null = null;
        try {
          context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
          await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
          const page = await context.newPage();
          page.setDefaultTimeout(180_000);
          let pageErrors = 0, writes = 0, documentsFinished = 0, documentsFailed = 0, scriptsFinished = 0, scriptsFailed = 0, documentStatus: number | null = null, documentFailure = "none", documentStartedAt = 0, documentFailureMs: number | null = null;
          page.on("pageerror", () => pageErrors += 1);
          page.on("request", (request) => { if (request.resourceType() === "document") documentStartedAt = performance.now(); if (["POST", "PATCH", "DELETE"].includes(request.method()) && new URL(request.url()).pathname.includes("/admissions/invitations")) writes += 1; });
          page.on("requestfinished", (request) => { if (request.resourceType() === "document") documentsFinished += 1; if (request.resourceType() === "script") scriptsFinished += 1; });
          page.on("response", (response) => { if (response.request().resourceType() === "document") documentStatus = response.status(); });
          page.on("requestfailed", (request) => { if (request.resourceType() === "document") { documentsFailed += 1; documentFailureMs = Math.round(performance.now() - documentStartedAt); const reason = request.failure()?.errorText; const domainCode = reason?.match(/(NSURLErrorDomain|WebKitErrorDomain|kCFErrorDomainCFNetwork)[^\d-]*(-?\d+)/u); documentFailure = domainCode ? `${domainCode[1]}:${domainCode[2]}` : reason && /^(?:Load failed|The network connection was lost\.|The request timed out\.|Connection terminated|Resource load failed|cancelled|Load request cancelled|Unknown)$/u.test(reason) ? reason : "other"; } if (request.resourceType() === "script") scriptsFailed += 1; });
          try {
            await page.goto(`${origin}/${slug}/academia/admissions/invitations`, { waitUntil: "commit" });
            await page.getByRole("button", { name: "Nueva invitación", exact: true }).waitFor({ state: "visible" });
            await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent === "Nueva invitación" && !button.disabled));
          } catch {
            const state = await page.evaluate(() => ({ readyState: document.readyState, buttons: document.querySelectorAll("button").length, inputs: document.querySelectorAll("input").length }));
            const routeMatches = new URL(page.url()).pathname === `/${slug}/academia/admissions/invitations`;
            const contextResponse = await page.evaluate(async (path) => { const response = await fetch(path, { signal: AbortSignal.timeout(180_000) }); return { status: response.status, body: await response.json() }; }, `/api/tribes/${slug}/admissions/invitations/context`).catch(() => ({ status: 0, body: null }));
            const parsedContext = personalInvitationManagementPageStateSchema.safeParse(contextResponse.body);
            const current = { status: contextResponse.status, viewerKnown: parsedContext.success && parsedContext.data.kind === "ready" && parsedContext.data.viewerId === fixture.userId, ready: parsedContext.success && parsedContext.data.kind === "ready" };
            throw new Error(`WebKit personal management readiness failed: state=${JSON.stringify(state)} pageErrors=${pageErrors} writes=${writes} documentsFinished=${documentsFinished} documentsFailed=${documentsFailed} scriptsFinished=${scriptsFinished} scriptsFailed=${scriptsFailed} documentStatus=${documentStatus} documentFailure=${documentFailure} documentFailureMs=${documentFailureMs} routeMatches=${routeMatches} context=${JSON.stringify(current)}`);
          }
          expect(pageErrors).toBe(0);
          expect(writes).toBe(0);
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
        } finally { try { await context?.close(); } finally { await browser.close(); } }
      }));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_personal_invitations where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ total: 0 }]);
      });
    });
  }, 600_000);
});
