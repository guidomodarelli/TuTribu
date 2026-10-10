/** @vitest-environment node */
/** Verifies native viewer-fenced IndexedDB restoration with the final client build in both engines and sizes. @module allowlist-import-browser-restoration-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("final native local draft restoration", () => {
  it("should restore one private scoped file after reload with current native viewer checks and no automatic preview/confirm POST on all four browser targets", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-import-restoration", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAllowlistManagement(database, config), slug = `allowlist-${fixture.tribeId}`;
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261007231500_bind_verification_operation_purpose.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261008220000_scope_admission_operation_recovery.sql"]) await database.applyMigration(migration);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        for (const { name, engine, width } of [{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }]) {
          const browser = await engine.launch({ headless: true }), context = await browser.newContext({ viewport: { width, height: 900 } });
          try {
            await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
            const page = await context.newPage(); page.setDefaultTimeout(180_000);
            let writes = 0, pageErrors = 0;
            page.on("pageerror", () => { pageErrors += 1; }); page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname.includes("/allowlist/imports")) writes += 1; });
            await page.goto(`${origin}/${slug}/academia/admissions/allowlist/imports`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => !document.querySelector<HTMLInputElement>('input[type="file"]')?.disabled);
            await page.getByLabel("Archivo CSV de habilitados", { exact: true }).setInputFiles({ name: "restored.csv", mimeType: "text/csv", buffer: Buffer.from("identity,display_name\nscoped@example.test,Nombre") });
            await page.getByText("Archivo conservado: restored.csv", { exact: true }).waitFor({ state: "visible" });
            await page.getByRole("checkbox", { name: "Confirmo guardar esta vista previa temporal", exact: true }).click();
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.getByText("Archivo conservado: restored.csv", { exact: true }).waitFor({ state: "visible" });
            await page.waitForFunction(() => !document.querySelector<HTMLInputElement>('input[type="file"]')?.disabled);
            expect(await page.getByRole("checkbox", { name: "Confirmo guardar esta vista previa temporal", exact: true }).isChecked()).toBe(false);
            expect(await page.getByRole("button", { name: "Crear vista previa", exact: true }).isDisabled()).toBe(true);
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false); expect(pageErrors).toBe(0); expect(writes).toBe(0);
            console.info(JSON.stringify({ phase: "import_restore_complete", engine: name, width, writes }));
          } finally { await context.close(); await browser.close(); }
        }
      }, { messagingSecurity }));
    });
  }, 1_200_000);
});
