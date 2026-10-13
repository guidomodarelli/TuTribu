/** @vitest-environment node */
/** Exercises real administrative UI, native signed recency and lost-reply recovery across both engines and sizes. @module personal-invitation-management-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalInvitationManagementDatabase } from "@/tests/support/personal-invitation-management-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native personal invitation management UI", () => {
  it.concurrent.each([false, true])("should create, rename, reemit once after lost reply and revoke on real browser engines phone=%s", async (phone) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-personal-management-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await preparePersonalInvitationManagementDatabase(database, config), slug = `allowlist-${fixture.tribeId}`;
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '1 hour' where id=${fixture.sessionId}`);
        await transaction.execute(sql`update public.tribes set name='Academia de ejemplo' where id=${fixture.tribeId}`);
        if (phone) { await transaction.execute(sql`update public.academy_admission_policies set contact_type='phone',requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.tribeId}`); await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,allowed_countries) values (${fixture.tribeId},ARRAY['AR'])`); }
      });
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        for (const [caseIndex, candidate] of [{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }].entries()) {
          const { name, engine, width } = candidate, browser = await engine.launch({ headless: true }), context = await browser.newContext({ viewport: { width, height: 900 } });
          try { await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]); }
          catch { await browser.close(); throw new Error("Personal management native cookie placement failed"); }
          const page = await context.newPage(), failures: string[] = [], writes: { id: string; method: string }[] = []; let navigations = 0, reportingReads = 0, codeRequests = 0, lost = false, firstId = "", latestId = "", rawUrl = "";
          const label = `Grupo ${name} ${width}`, updatedLabel = label + " revisado", identity = phone ? ["+5491112345678", "+5491112345679", "+5491112345680", "+5491112345681"][caseIndex] : `${name}.${width}+management@example.test`;
          const completed = (stage: string) => process.stdout.write(JSON.stringify({ phase: "personal_management_ui", engine: name, width, phone, stage }) + "\n");
          page.setDefaultTimeout(180_000); page.on("pageerror", (error) => failures.push(error.name));
          page.on("request", (request) => { const path = new URL(request.url()).pathname; if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1; if (path === "/api/siteping/identity") reportingReads += 1; if (path.endsWith("/challenges") && request.method() === "POST") codeRequests += 1; if (path.includes("/admissions/invitations") && ["POST", "PATCH"].includes(request.method())) { const body = request.postDataJSON(); writes.push({ id: body.operationId, method: request.method() }); } });
          await page.route(`**/api/tribes/${slug}/admissions/invitations`, async (route) => {
            if (route.request().method() !== "POST") { await route.continue(); return; }
            try {
              const response = await route.fetch({ timeout: 180_000 }), body = await response.json();
              if (body.result?.invitationId) { latestId = String(body.result.invitationId); if (!firstId) firstId = latestId; }
              if (lost) { lost = false; await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ code: "dependency_unavailable", message: "El servicio no está disponible. Conservamos el estado de tu operación.", requestId: "synthetic-lost" }) }); }
              else await route.fulfill({ response });
            } catch { throw new Error("Personal management original POST observation failed"); }
          });
          try {
            await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation);
            try { await page.goto(`${origin}/${slug}/academia/admissions/invitations`, { waitUntil: "commit" }); } catch (error) { const errorName = error instanceof Error ? error.name : "Unknown"; throw new Error(`Personal management UI navigation failed engine=${name} width=${width} phone=${phone} errorName=${errorName}`); }
            await page.getByRole("button", { name: "Nueva invitación", exact: true }).waitFor({ state: "visible" });
            await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent === "Nueva invitación" && !button.disabled));
            expect(writes).toHaveLength(0); completed("ready");
            const capture = !phone && name === "chromium" && width === 1280;
            if (capture) await captureAdmissionReview(page, "management-initial", [fixture.userId, fixture.sessionToken, fixture.own.email, secret], "personal-management-captures.json");
            await page.getByLabel("Nombre interno", { exact: true }).fill(label); await page.getByLabel(phone ? "Teléfono destinatario" : "Correo destinatario", { exact: true }).fill(identity);
            await page.getByRole("checkbox", { name: /Reconozco la dispensa/ }).check(); await page.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal.", exact: true }).check();
            await page.getByRole("button", { name: "Guardar acción", exact: true }).click();
            await page.getByLabel("Enlace personal", { exact: true }).waitFor({ state: "visible" }); rawUrl = await page.getByLabel("Enlace personal", { exact: true }).inputValue();
            expect(new URL(rawUrl).origin === origin).toBe(true); completed("issued");
            if (capture) await captureAdmissionReview(page, "management-issued", [fixture.userId, fixture.sessionToken, fixture.own.email, secret, rawUrl, new URL(rawUrl).pathname.split("/").at(-1)!], "personal-management-captures.json");
            await page.getByRole("button", { name: `Renombrar ${label}`, exact: true }).waitFor({ state: "visible" });
            await fixture.confirm(REAUTHENTICATION_OPERATION.renamePersonalInvitation, firstId);
            await page.getByRole("button", { name: `Renombrar ${label}`, exact: true }).click(); await page.getByLabel("Nombre interno", { exact: true }).fill(updatedLabel);
            await page.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal.", exact: true }).check(); await page.getByRole("button", { name: "Guardar acción", exact: true }).click();
            await page.getByRole("button", { name: `Reemitir ${updatedLabel}`, exact: true }).waitFor({ state: "visible" }); completed("renamed");
            await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation);
            await page.getByRole("button", { name: `Reemitir ${updatedLabel}`, exact: true }).click();
            await page.getByRole("checkbox", { name: /Reconozco la dispensa/ }).check(); await page.getByRole("checkbox", { name: "Sin vencimiento", exact: true }).check(); await page.getByRole("checkbox", { name: /Reconozco que el enlace seguirá/ }).check(); await page.getByRole("checkbox", { name: /Confirmo revocar/ }).check(); await page.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal.", exact: true }).check();
            lost = true; await page.getByRole("button", { name: "Guardar acción", exact: true }).click();
            await page.getByRole("button", { name: "Consultar operación original", exact: true }).waitFor({ state: "visible" }); completed("uncertain");
            if (capture) await captureAdmissionReview(page, "management-response-lost", [fixture.userId, fixture.sessionToken, fixture.own.email, secret, rawUrl], "personal-management-captures.json");
            await page.getByRole("button", { name: "Consultar operación original", exact: true }).click();
            await page.getByText(/su enlace no se puede recuperar/).waitFor({ state: "visible" });
            await page.getByRole("button", { name: `Revocar ${updatedLabel}`, exact: true }).waitFor({ state: "visible" }); completed("recovered");
            expect(writes.filter((write) => write.method === "POST")).toHaveLength(2); expect(latestId !== firstId).toBe(true);
            await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, latestId);
            await page.getByRole("button", { name: `Revocar ${updatedLabel}`, exact: true }).click(); await page.getByLabel("Motivo interno", { exact: true }).fill("Retiro de ejemplo"); await page.getByRole("checkbox", { name: "Confirmo esta acción sobre la invitación personal.", exact: true }).check(); await page.getByRole("button", { name: "Guardar acción", exact: true }).click();
            await page.getByRole("button", { name: "Guardar acción", exact: true }).waitFor({ state: "visible" }); await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).some((button) => button.textContent === "Guardando…")); completed("revoked");
            const persisted = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).filter((key) => key.startsWith("tutribu-personal-invitation-management:")).map((key) => [key, sessionStorage.getItem(key)])))); expect(persisted.includes(rawUrl)).toBe(false); expect(persisted.includes(identity)).toBe(false);
            expect(navigations).toBe(1); expect(reportingReads).toBe(0); expect(codeRequests).toBe(0); expect(failures).toEqual([]);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
            const rows = (await database.withContext(fixture.own, (transaction) => transaction.execute<{ id: string; status: string; version: number }>(sql`select id,status,version from public.academy_personal_invitations where id in (${firstId},${latestId}) order by id`))).rows;
            expect(rows.map((row) => ({ status: row.status, version: row.version })).sort((first, second) => first.version - second.version)).toEqual([{ status: "revoked", version: 2 }, { status: "revoked", version: 3 }]);
          } finally { await context.close(); await browser.close(); }
        }
        expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 0 }]);
        expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.contact_verification_challenges where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 0 }]);
      }, { messagingSecurity }));
    });
  }, 3_600_000);
});
