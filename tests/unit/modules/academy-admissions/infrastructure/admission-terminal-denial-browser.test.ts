/** @vitest-environment node */
/** Exercises real denied presentation recovery after a lost native HTTP response in Chromium/WebKit. @module admission-terminal-denial-browser-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native terminal admission denial recovery", () => {
  it("should recover the actual completed rejection, retain the draft and avoid another POST, membership or route refresh across both engines and widths", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-terminal-denial-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database, config), slug = `allowlist-${fixture.tribeId}`;
      for (const migration of ["20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261007004000_read_exact_own_admission_request.sql", "20261008220000_scope_admission_operation_recovery.sql"]) await database.applyMigration(migration);
      // Reproduce the missing prerequisite with only safe PostgreSQL metadata;
      // the real function references the immutable verification purpose column.
      const unprepared = await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select * from public.read_own_admission_operations(${fixture.tribeId},${fixture.sessionId},${randomUUID()})`)).then(() => null, (error: unknown) => error);
      const postgresError = unprepared instanceof Error && unprepared.cause && typeof unprepared.cause === "object" && "code" in unprepared.cause ? unprepared.cause.code : null;
      expect(postgresError).toBe("42703");
      process.stdout.write(JSON.stringify({ phase: "native_recovery_prerequisite", postgresCode: postgresError }) + "\n");
      await database.applyMigration("20261007231500_bind_verification_operation_purpose.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        for (const { name, engine, width } of [{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }]) {
          const applicant = await createApplicant(), token = randomUUID();
          await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set token=${token} where id=${applicant.sessionId}`));
          const browser = await engine.launch({ headless: true }), context = await browser.newContext({ viewport: { width, height: 900 } });
          const page = await context.newPage(), signed = `${token}.${await makeSignature(token, secret)}`;
          let posts = 0, documentNavigations = 0, pageErrors = 0;
          page.setDefaultTimeout(180_000); page.on("pageerror", () => pageErrors++);
          page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentNavigations++; if (request.method() === "POST" && request.url().endsWith("/admissions/submissions")) posts++; });
          try {
            await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(signed), url: origin, httpOnly: true, sameSite: "Lax" }]);
            await page.route(`**/api/tribes/${slug}/admissions/submissions`, async (route) => {
              // Playwright's transport call log contains the signed cookie;
              // discard that private diagnostic at this test-owned edge.
              const response = await route.fetch().catch(() => { throw new Error("Native terminal denial response observation failed"); });
              expect(response.status()).toBe(409);
              expect(await response.json()).toMatchObject({ code: "admission_ineligible", operation: { state: "completed" } });
              await route.abort("failed");
            }, { times: 1 });
            await page.goto(`${origin}/admissions/${slug}`, { waitUntil: "networkidle" });
            const explanation = "Conservá mi explicación para una nueva confirmación.";
            await page.getByLabel(ADMISSION_UI_COPY.message).fill(explanation);
            await expect.poll(() => page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }).isEnabled()).toBe(true);
            await page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }).check();
            await page.getByRole("button", { name: ADMISSION_UI_COPY.submit }).click();
            await page.getByText(ADMISSION_UI_COPY.uncertain, { exact: true }).waitFor();
            const operationResponse = page.waitForResponse((response) => new URL(response.url()).pathname.startsWith(`/api/tribes/${slug}/admissions/operations/`) && response.request().method() === "GET").catch(() => { throw new Error("Native original denial read observation failed"); });
            await page.getByRole("button", { name: "Consultar estado", exact: true }).click();
            const original = await operationResponse;
            expect(original.status()).toBe(200);
            const payload = await original.json();
            expect({ type: payload.type, state: payload.state, outcome: payload.result?.outcome, code: payload.result?.code ?? payload.code }).toEqual({ type: "submit_admission", state: "completed", outcome: "denied", code: "admission_ineligible" });
            await page.getByText("Falta un requisito actual para resolver el ingreso. Consultá el estado de la solicitud.", { exact: true }).waitFor();
            expect(await page.getByLabel(ADMISSION_UI_COPY.message).inputValue()).toBe(explanation);
            expect(posts).toBe(1); expect(documentNavigations).toBe(1); expect(pageErrors).toBe(0);
            expect(await page.getByRole("link", { name: ADMISSION_UI_COPY.openAcademy }).count()).toBe(0);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
            if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "admission-terminal-denial", [applicant.userId, applicant.sessionId, applicant.email, token, signed, secret], "terminal-denial-captures.json");
          } finally { await context.close(); await browser.close(); }
          await database.withContext(fixture.own, async (transaction) => {
            expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}) as requests,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}) as members,(select count(*)::int from public.academy_admission_operations where actor_user_id=${applicant.userId} and operation_type='submit_admission' and state='completed' and public_result->>'outcome'='denied') as denials`)).rows).toEqual([{ requests: 0, members: 0, denials: 1 }]);
          });
          process.stdout.write(JSON.stringify({ phase: "terminal_denial_browser_completed", engine: name, width, posts, documentNavigations, pageErrors }) + "\n");
        }
      }, { messagingSecurity }));
    });
  }, 1_200_000);
});
