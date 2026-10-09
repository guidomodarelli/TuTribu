/** @vitest-environment node */
/** Exercises actual CSV controls, original recovery and partial commits with native auth/SQL in both engines. @module allowlist-import-browser-ui-tests */
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
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native CSV browser workflow", () => {
  it("should preview without list changes, recover a lost reply and preserve partial rows through explicit pending-only resume on Chromium/WebKit desktop/mobile", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-import-browser", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAllowlistManagement(database, config), slug = `allowlist-${fixture.tribeId}`;
      for (const migration of ["20261009061000_guard_allowlist_import_progress.sql", "20261005093000_guard_academy_membership_sources.sql", "20261007231500_bind_verification_operation_purpose.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261008220000_scope_admission_operation_recovery.sql"]) await database.applyMigration(migration);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const targets = [{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }].filter((target) => !process.env.ADMISSION_IMPORT_BROWSER_TARGET || `${target.name}:${target.width}` === process.env.ADMISSION_IMPORT_BROWSER_TARGET);
        if (targets.length === 0) throw new Error("Native import browser target is unknown");
        let addedEntries = 0;
        for (const { name, engine, width } of targets) {
          console.info(JSON.stringify({ phase: "import_ui_start", engine: name, width }));
          await fixture.confirm(REAUTHENTICATION_OPERATION.previewAllowlistImport);
          const browser = await engine.launch({ headless: true }), context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
          await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
          const page = await context.newPage(), selector = 'section[aria-label="Importación de habilitados"]', forbidden = [fixture.userId, fixture.sessionToken, fixture.own.email, secret], capture = name === "chromium" && width === 1280;
          const writes: { path: string; operationId: string; expectedVersion?: number; selectedRows?: number[] }[] = [];
          let navigations = 0, pageErrors = 0, lostPreview = true;
          page.setDefaultTimeout(180_000); page.on("pageerror", () => { pageErrors += 1; });
          page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1; if (request.method() === "POST" && new URL(request.url()).pathname.includes("/allowlist/imports")) { const body = request.postDataJSON(); writes.push({ path: new URL(request.url()).pathname, operationId: body.operationId, expectedVersion: body.expectedVersion, selectedRows: body.selectedRows }); } });
          try {
            await page.goto(`${origin}/${slug}/academia/admissions/allowlist`, { waitUntil: "domcontentloaded" });
            await page.getByRole("link", { name: "Importar habilitados desde CSV", exact: true }).click();
            const upload = page.getByLabel("Archivo CSV de habilitados", { exact: true }); await upload.waitFor({ state: "visible" });
            await page.waitForFunction(() => !document.querySelector<HTMLInputElement>('input[type="file"]')?.disabled);
            if (capture) await captureAdmissionReview(page, "allowlist-import-empty", forbidden, "allowlist-import-captures.json", { selector });
            const templatePromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Descargar plantilla", exact: true }).click();
            expect((await templatePromise).suggestedFilename()).toBe("allowlist-import-template.csv");
            if (width === 1280) {
              const prefix = "identity,display_name\ncapacity@example.test", suffix = ",Nombre", largeCsv = prefix + " ".repeat(ADMISSION_LIMIT.csvByteCount - prefix.length - suffix.length) + suffix;
              await upload.setInputFiles({ name: "capacity.csv", mimeType: "text/csv", buffer: Buffer.from(largeCsv) });
              await page.getByText("Archivo conservado: capacity.csv", { exact: true }).waitFor({ state: "visible" });
              expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("tutribu-allowlist-import:")).every((key) => (sessionStorage.getItem(key)?.length ?? 0) < 4096))).toBe(true);
              await page.getByRole("checkbox", { name: "Confirmo guardar esta vista previa temporal", exact: true }).click(); await page.getByRole("button", { name: "Crear vista previa", exact: true }).click();
              await page.getByRole("checkbox", { name: "Seleccionar fila 1", exact: true }).waitFor({ state: "visible" });
              // Explicit reload exercises the native persisted file; writes never invoke route refresh.
              await page.reload({ waitUntil: "domcontentloaded" });
              await page.getByRole("checkbox", { name: "Seleccionar fila 1", exact: true }).waitFor({ state: "visible" });
              expect(await page.getByRole("checkbox", { name: "Confirmo incorporar sólo las filas elegidas", exact: true }).isChecked()).toBe(false);
              expect(await page.getByText("Archivo conservado: capacity.csv", { exact: true }).isVisible()).toBe(true);
              writes.length = 0;
            }
            const isPartial = capture, rowCount = isPartial ? 30 : 2, contactPrefix = `${name}.${width}`;
            const csvText = "identity,display_name\n" + Array.from({ length: rowCount }, (_, index) => `${contactPrefix}.${index + 1}@example.test,${index === 0 ? '"<script>inert()</script>"' : `Grupo ${index + 1}`}`).join("\n") + "\ninvalid,Nombre";
            await upload.setInputFiles({ name: "synthetic.csv", mimeType: "text/csv", buffer: Buffer.from(csvText) });
            await page.getByText("Archivo conservado: synthetic.csv", { exact: true }).waitFor({ state: "visible" });
            await page.route(`**/api/tribes/${slug}/admissions/allowlist/imports`, async (route) => {
              if (lostPreview && route.request().method() === "POST") { lostPreview = false; try { await route.fetch({ timeout: 180_000 }); } catch { await route.abort().catch(() => {}); throw new Error("Synthetic authenticated import preview did not finish"); } await route.fulfill({ status: 502, contentType: "application/json", body: "{}" }); }
              else await route.continue();
            });
            await page.getByRole("checkbox", { name: "Confirmo guardar esta vista previa temporal", exact: true }).click(); await page.getByRole("button", { name: "Crear vista previa", exact: true }).click();
            const originalButton = page.getByRole("button", { name: "Consultar operación original", exact: true }); await originalButton.waitFor({ state: "visible" });
            if (capture) await captureAdmissionReview(page, "allowlist-import-uncertain", forbidden, "allowlist-import-captures.json", { selector });
            await originalButton.click(); await page.getByRole("checkbox", { name: "Seleccionar fila 1", exact: true }).waitFor({ state: "visible" });
            expect(writes).toHaveLength(1); expect(await page.getByRole("checkbox", { name: `Seleccionar fila ${rowCount + 1}`, exact: true }).isDisabled()).toBe(true);
            expect(await page.getByRole("checkbox", { name: "Seleccionar fila 1", exact: true }).isChecked()).toBe(false);
            expect(await page.locator(selector).getByText("<script>inert()</script>", { exact: true }).isVisible()).toBe(true);
            if (capture) await captureAdmissionReview(page, "allowlist-import-preview", forbidden, "allowlist-import-captures.json", { selector });
            const importId = (await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string }>(sql`select id from public.academy_allowlist_imports where tribe_id=${fixture.tribeId} order by created_at desc limit 1`)).rows[0].id));
            await fixture.confirm(REAUTHENTICATION_OPERATION.confirmAllowlistImport, importId);
            const beforeCount = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows[0].count);
            expect(beforeCount).toBe(addedEntries);
            for (let row = 1; row <= rowCount; row += 1) await page.getByRole("checkbox", { name: `Seleccionar fila ${row}`, exact: true }).click();
            if (isPartial) await database.withContext(fixture.own, async (transaction) => {
              await transaction.execute(sql.raw("create function public.synthetic_import_browser_failure() returns trigger language plpgsql as $$ begin if new.row_number=26 and new.outcome is not null then raise exception 'Controlled later browser import rollback'; end if; return new; end $$"));
              await transaction.execute(sql.raw("create trigger synthetic_import_browser_failure before update on public.academy_allowlist_import_rows for each row execute function public.synthetic_import_browser_failure()"));
            });
            await page.getByRole("checkbox", { name: "Confirmo incorporar sólo las filas elegidas", exact: true }).click(); await page.getByRole("button", { name: "Confirmar filas seleccionadas", exact: true }).click();
            if (isPartial) {
              await originalButton.waitFor({ state: "visible" }); await originalButton.click();
              await page.getByText("Agregada · Versión de entrada 1", { exact: true }).first().waitFor({ state: "visible" });
              expect(await page.getByRole("checkbox", { name: "Seleccionar fila 1", exact: true }).isDisabled()).toBe(true);
              expect(await page.getByRole("checkbox", { name: "Seleccionar fila 26", exact: true }).isChecked()).toBe(true);
              if (capture) await captureAdmissionReview(page, "allowlist-import-partial", forbidden, "allowlist-import-captures.json", { selector });
              await database.withContext(fixture.own, async (transaction) => { await transaction.execute(sql.raw("drop trigger synthetic_import_browser_failure on public.academy_allowlist_import_rows")); await transaction.execute(sql.raw("drop function public.synthetic_import_browser_failure()")); await transaction.execute(sql`update public.academy_admission_operations set lease_until=clock_timestamp()-interval '1 second',version=version+1 where actor_user_id=${fixture.userId} and tribe_id=${fixture.tribeId} and idempotency_key=${writes[1].operationId}`); });
              await page.getByRole("checkbox", { name: "Confirmo incorporar sólo las filas elegidas", exact: true }).click(); await page.getByRole("button", { name: "Retomar filas pendientes", exact: true }).click();
              await page.locator(selector).getByText("La confirmación terminó. Revisá los resultados de cada fila.", { exact: true }).waitFor({ state: "visible" });
              expect(writes[2].selectedRows).toEqual([26, 27, 28, 29, 30]); expect(writes[2].operationId).not.toBe(writes[1].operationId);
              await originalButton.click(); await page.getByRole("button", { name: "Conciliar resultados anteriores", exact: true }).waitFor({ state: "visible" }); await page.getByRole("button", { name: "Conciliar resultados anteriores", exact: true }).click();
              await page.waitForFunction(() => !document.body.textContent?.includes("Confirmaciones anteriores por conciliar:"));
              expect(writes[3].operationId).toBe(writes[1].operationId); expect(writes[3].selectedRows).toHaveLength(30);
            } else await page.locator(selector).getByText("La confirmación terminó. Revisá los resultados de cada fila.", { exact: true }).waitFor({ state: "visible" });
            if (capture) await captureAdmissionReview(page, "allowlist-import-completed", forbidden, "allowlist-import-captures.json", { selector });
            const reportPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Descargar reporte", exact: true }).click(); expect((await reportPromise).suggestedFilename()).toBe("allowlist-import-report.csv");
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false); expect(pageErrors).toBe(0); expect(navigations).toBe(width === 1280 ? 2 : 1);
            await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]); expect((await transaction.execute(sql`select count(*)::int as count from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: beforeCount + rowCount }]); });
            addedEntries += rowCount;
            console.info(JSON.stringify({ phase: "import_ui_complete", engine: name, width, writes: writes.length, rows: rowCount }));
          } finally { await context.close(); await browser.close(); }
        }
      }, { messagingSecurity }));
    });
  }, 2_400_000);
});
