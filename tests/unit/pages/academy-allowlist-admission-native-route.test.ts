/** @vitest-environment node */
/** Exercises common automatic list admission through real Next, native cookies and both browser engines. @module academy-allowlist-native-route-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { continueToAdmissionSubmission } from "@/tests/support/admission-contact-browser-actions";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native common automatic list admission", () => {
  it("should create one basic membership only after common list confirmation on Chromium and WebKit desktop and mobile", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(MESSAGING_CRYPTO.keyBytes).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-common-list-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const { fixture, applicant } = await prepareAllowlistAdmission(database, config);
      const slug = `allowlist-${fixture.tribeId}`;
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        for (const { engine, width } of [{ engine: chromium, width: 1280 }, { engine: chromium, width: 390 }, { engine: webkit, width: 1280 }, { engine: webkit, width: 390 }]) {
          // Arrange: actual trusted account and enabled entry, with no member or request.
          const recipient = await applicant(true);
          const created = await fixture.writer.create({ context: await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry), operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, displayName: "Ingreso básico comprobado" });
          expect(created).toMatchObject({ state: "completed" });
          const session = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ token: string }>(sql`select token from public.session where id=${recipient.sessionId}`)).rows[0]);
          /** Reads only scoped membership, request and consumed authority counts. @returns Actual state with no tokens or provider payloads. */
          const counts = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::integer from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}) as members,(select count(*)::integer from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}) as requests,(select count(*)::integer from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId} and user_id=${recipient.userId} and applied_at is not null and revoked_at is null) as consumed,(select count(*)::integer from public.contact_verification_challenges where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}) as challenges`)).rows[0]);
          expect(await counts()).toEqual({ members: 0, requests: 0, consumed: 0, challenges: 0 });
          const browser = await engine.launch({ headless: true });
          try {
            const context = await browser.newContext({ viewport: { width, height: 900 } });
            try {
              await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${session.token}.${await makeSignature(session.token, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
              const page = await context.newPage(), failures: string[] = [];
              let submissions = 0, codeRequests = 0, documentRequests = 0, routeRefreshes = 0;
              let observeRouteRefreshes = false;
              page.on("pageerror", () => failures.push("page_error"));
              page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) failures.push("hydration_error"); });
              page.on("request", (request) => { const path = new URL(request.url()).pathname; if (request.resourceType() === "document") documentRequests++; if (observeRouteRefreshes && path === `/admissions/${slug}` && request.headers().rsc === "1") routeRefreshes++; if (request.method() === "POST" && path.endsWith("/admissions/submissions")) submissions++; if (request.method() === "POST" && path.endsWith("/challenges")) codeRequests++; });
              await page.goto(`${origin}/admissions/${slug}`, { waitUntil: "domcontentloaded" });
              await continueToAdmissionSubmission(page);
              const confirmation = page.getByRole("checkbox", { name: "Confirmo que quiero solicitar ingreso a esta academia", exact: true });
              await confirmation.waitFor({ state: "visible", timeout: 90_000 });
              await page.waitForLoadState("networkidle");
              observeRouteRefreshes = true;
              expect(submissions).toBe(0);
              expect(await counts()).toEqual({ members: 0, requests: 0, consumed: 0, challenges: 0 });

              // Act: a real UI confirmation reaches the native HTTP writer once.
              const response = page.waitForResponse((result) => result.url().endsWith(`/api/tribes/${slug}/admissions/submissions`) && result.request().method() === "POST");
              await confirmation.check();
              await page.getByRole("button", { name: "Solicitar ingreso", exact: true }).click();
              const admitted = await response;
              expect(admitted.status()).toBe(201);
              const result = await admitted.json();
              expect(result).toMatchObject({ outcome: "admitted", membership: { role: "tribemate", status: "active" }, nextHref: `/${slug}/academia` });
              await page.getByRole("link", { name: "Abrir academia", exact: true }).waitFor({ state: "visible" });

              // Assert: replay uses the exact public body and cannot produce another effect.
              const originalBody = admitted.request().postDataJSON();
              const replay = await context.request.post(`${origin}/api/tribes/${slug}/admissions/submissions`, { data: originalBody, headers: { origin } });
              expect(replay.status()).toBe(200);
              expect(await replay.json()).toEqual(result);
              await page.waitForLoadState("networkidle");
              expect(await counts()).toEqual({ members: 1, requests: 1, consumed: 1, challenges: 0 });
              expect(submissions).toBe(1);
              expect(codeRequests).toBe(0);
              expect(documentRequests).toBe(1);
              expect(routeRefreshes).toBe(0);
              expect(failures).toEqual([]);
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
              await database.withContext(fixture.own, async (transaction) => {
                expect((await transaction.execute(sql`select status,source,evidence_source from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ status: "approved", source: "common", evidence_source: "base" }]);
                expect((await transaction.execute(sql`select outcome,actor_kind,rule from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ outcome: "approved", actor_kind: "system", rule: "automatic" }]);
                expect((await transaction.execute(sql`select count(*)::integer as grants from public.member_access_grants where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ grants: 0 }]);
              });
            } finally { await context.close(); }
          } finally { await browser.close(); }
        }
      }, { messagingSecurity }));
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
