/** @vitest-environment node */
/** Exercises actual list SSR/browser controls with native auth, PostgreSQL and both rendering engines. @module allowlist-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native allowlist UI", () => {
  it("should preserve stale drafts and recover committed originals across Chromium/WebKit at desktop/mobile widths", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-allowlist-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAllowlistManagement(database, config), slug = `allowlist-${fixture.tribeId}`;
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261007231500_bind_verification_operation_purpose.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261008220000_scope_admission_operation_recovery.sql"]) await database.applyMigration(migration);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        for (const { name, engine, width } of [{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }]) {
          console.info(JSON.stringify({ phase: "allowlist_ui_start", engine: name, width }));
          const createContext = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
          const identity = `${name}.${width}+tag@example.test`, created = await fixture.writer.create({ context: createContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: identity }, displayName: "Grupo inicial" });
          if (created.state !== "completed") throw new Error("Synthetic list seed did not complete");
          const entryId = created.result.entryId, editContext = await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, entryId);
          const browser = await engine.launch({ headless: true }), context = await browser.newContext({ viewport: { width, height: 900 } });
          await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
          const page = await context.newPage(), pageErrors: string[] = [], writes: { operationId: string; expectedVersion?: number }[] = [];
          let routeNavigations = 0;
          page.setDefaultTimeout(180_000); page.on("pageerror", () => pageErrors.push("pageerror"));
          page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) routeNavigations += 1; if (new URL(request.url()).pathname.includes("/admissions/allowlist") && ["POST", "PATCH"].includes(request.method())) { const body = request.postDataJSON(); writes.push({ operationId: body.operationId, expectedVersion: body.expectedVersion }); } });
          const forbidden = [fixture.userId, fixture.sessionToken, fixture.own.email, secret], capture = name === "chromium" && width === 1280;
          try {
            await page.goto(`${origin}/${slug}/academia/admissions/allowlist`, { waitUntil: "domcontentloaded" });
            const edit = page.getByRole("button", { name: `Editar ${identity}`, exact: true });
            const selectedRow = page.getByRole("listitem").filter({ has: edit });
            await edit.waitFor({ state: "visible" });
            await page.waitForFunction(() => Array.from(document.querySelectorAll('section[aria-label="Gestión de lista de habilitados"] button')).some((button) => button.textContent === "Editar" && !button.hasAttribute("disabled")));
            if (capture) await captureAdmissionReview(page, "allowlist-list", forbidden, "allowlist-captures.json", { selector: 'section[aria-label="Gestión de lista de habilitados"]' });
            await edit.click();
            expect(await page.getByLabel("Correo de la entrada", { exact: true }).isDisabled()).toBe(true);
            await page.getByLabel("Nombre orientativo (opcional)", { exact: true }).fill("Mi borrador");
            await fixture.writer.update({ context: editContext, operationId: randomUUID(), confirmed: true, entryId, expectedVersion: 1, patch: { displayName: "Cambio concurrente" } });
            await page.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista", exact: true }).click();
            await page.getByRole("button", { name: "Guardar entrada", exact: true }).click();
            const readCurrent = page.getByRole("button", { name: "Consultar versión actual", exact: true }); await readCurrent.waitFor({ state: "visible" });
            expect(await page.getByLabel("Nombre orientativo (opcional)").inputValue()).toBe("Mi borrador");
            expect(await page.getByRole("button", { name: "Guardar entrada", exact: true }).isDisabled()).toBe(true);
            if (capture) await captureAdmissionReview(page, "allowlist-conflict", forbidden, "allowlist-captures.json", { selector: 'section[aria-label="Gestión de lista de habilitados"]' });
            await readCurrent.click(); await selectedRow.getByText("Cambio concurrente", { exact: true }).waitFor({ state: "visible" });
            expect(await page.getByLabel("Nombre orientativo (opcional)").inputValue()).toBe("Mi borrador");
            expect(await page.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista", exact: true }).isChecked()).toBe(false);
            await page.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista", exact: true }).click(); await page.getByRole("button", { name: "Guardar entrada", exact: true }).click();
            await selectedRow.getByText("Mi borrador", { exact: true }).waitFor({ state: "visible" });
            expect(writes.slice(0, 2).map((write) => write.expectedVersion)).toEqual([1, 2]); expect(writes[0].operationId).not.toBe(writes[1].operationId);
            await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
            await page.getByRole("button", { name: "Nueva entrada", exact: true }).click();
            const newIdentity = `nuevo.${name}.${width}@example.test`;
            await page.getByLabel("Correo de la entrada", { exact: true }).fill(newIdentity);
            let loseReply = true;
            await page.route(`**/api/tribes/${slug}/admissions/allowlist`, async (route) => { if (loseReply && route.request().method() === "POST") { loseReply = false; try { await route.fetch({ timeout: 180_000 }); } catch { await route.abort().catch(() => {}); throw new Error("Synthetic authenticated allowlist request did not complete"); } await route.fulfill({ status: 502, contentType: "application/json", body: "{}" }); } else await route.continue(); });
            await page.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista", exact: true }).click(); await page.getByRole("button", { name: "Guardar entrada", exact: true }).click();
            const original = page.getByRole("button", { name: "Consultar operación original", exact: true }); await original.waitFor({ state: "visible" });
            if (capture) await captureAdmissionReview(page, "allowlist-uncertain", forbidden, "allowlist-captures.json", { selector: 'section[aria-label="Gestión de lista de habilitados"]' });
            await original.click(); await page.getByText(newIdentity, { exact: true }).waitFor({ state: "visible" });
            expect(writes).toHaveLength(3); expect(routeNavigations).toBe(1);
            expect(pageErrors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
            if (capture) await captureAdmissionReview(page, "allowlist-recovered", forbidden, "allowlist-captures.json", { selector: 'section[aria-label="Gestión de lista de habilitados"]' });
            console.info(JSON.stringify({ phase: "allowlist_ui_complete", engine: name, width }));
          } finally { await page.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); await browser.close(); }
        }
      }, { messagingSecurity }));
      await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 8 }]); expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]); });
    });
  }, 1_200_000);
});
