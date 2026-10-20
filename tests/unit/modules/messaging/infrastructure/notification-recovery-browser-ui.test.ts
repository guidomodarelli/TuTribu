/** @vitest-environment node */
/** Exercises actual Next/session/SQL recovery and response-loss preservation on both browser engines. @module notification-recovery-browser-ui-tests */
import { openConnectionsStep } from "@/tests/support/messaging-connections-steps";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareNotificationDeliveryRecovery } from "@/tests/support/notification-delivery-recovery-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE, MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { notificationRecoveryOperationSchema } from "@/src/modules/messaging/constants/notification-delivery-recovery-schema";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native notification recovery UI", () => {
  it.each([{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }])("should preserve the original recovery after a lost response on $name at $width", async ({ name, engine, width }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => [purpose, { activeKeyId: purpose, keys: [{ id: purpose, materialBase64: randomBytes(MESSAGING_CRYPTO.keyBytes).toString("base64") }] }]));
      const keyringsJson = JSON.stringify(keyrings), environment = "synthetic-notification-recovery-ui", securityEpoch = randomUUID();
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: environment, MESSAGING_SECURITY_EPOCH: securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: keyringsJson });
      const fixture = await prepareNotificationDeliveryRecovery(database, 3_600_000, config);
      const tribeId = fixture.context.tribeId, slug = `connection-${tribeId}`;
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`));
      let providerRequests = 0;
      await database.withServerEnvironment((serverEnvironment) => withAdmissionNextServer(serverEnvironment, slug, async (origin, secret) => {
        const cookie = encodeURIComponent(`${fixture.creation.sessionToken}.${await makeSignature(fixture.creation.sessionToken, secret)}`);
        const browser = await engine.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
        const page = await context.newPage();
        let errors = 0, hydrationErrors = 0;
        const posts: { operationId: string; expectedVersion: number; targetConnectionId: string; expectedTargetVersion: number }[] = [];
        page.on("pageerror", () => { errors++; });
        page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match|server rendered/i.test(message.text())) hydrationErrors++; });
        page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname.endsWith(`/deliveries/${fixture.context.deliveryId}/recover`)) posts.push(request.postDataJSON()); });
        try {
          await context.addCookies([{ name: "better-auth.session_token", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" }]);
          await page.goto(`${origin}/${slug}/academia/admissions/messaging/connections`, { waitUntil: "networkidle", timeout: 120_000 }); await openConnectionsStep(page,"Seguridad");
          const recovery = page.getByRole("region", { name: "Recuperación de avisos", exact: true });
          const captureSelector = `section[aria-labelledby="${await recovery.getAttribute("aria-labelledby")}"]`;
          await recovery.getByRole("combobox", { name: "Aviso que querés recuperar" }).click({ timeout: 120_000 });
          await page.getByRole("option", { name: /Envío bloqueado/ }).click();
          const consent = recovery.getByRole("checkbox", { name: /Revisé el aviso/ });
          expect(await consent.isChecked()).toBe(false);
          expect(await recovery.getByRole("button", { name: "Registrar recuperación", exact: true }).isDisabled()).toBe(true);
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "notification-recovery-confirmation", [fixture.creation.sessionToken, secret, fixture.own.email, fixture.context.actorUserId], "notification-recovery-captures.json", { selector: captureSelector });
          const recoverPath = `**/api/tribes/${slug}/messaging/deliveries/${fixture.context.deliveryId}/recover`;
          await page.route(recoverPath, async (route) => {
            let response;
            try { response = await route.fetch({ timeout: 240_000 }); }
            catch { throw new Error("Notification recovery test transport failed before controlled response loss"); }
            expect(response.status()).toBe(200);
            expect(await response.json()).toMatchObject({ state: "completed", result: { originalDeliveryId: fixture.context.deliveryId, originalVersion: 2, targetConnectionId: fixture.input.targetConnectionId } });
            await route.abort("failed");
          });
          await consent.check();
          await recovery.getByRole("button", { name: "Registrar recuperación", exact: true }).click();
          await recovery.getByRole("alert").waitFor({ timeout: 240_000 });
          expect(posts).toHaveLength(1);
          expect(posts[0]).toMatchObject({ expectedVersion: 1, targetConnectionId: fixture.input.targetConnectionId, expectedTargetVersion: fixture.input.expectedTargetVersion });
          expect(await recovery.getByRole("button", { name: "Reanudar intento original", exact: true }).isDisabled()).toBe(true);
          await page.unroute(recoverPath);
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "notification-recovery-response-lost", [fixture.creation.sessionToken, secret, fixture.own.email, fixture.context.actorUserId], "notification-recovery-captures.json", { selector: captureSelector });
          await page.reload({ waitUntil: "networkidle", timeout: 120_000 }); await openConnectionsStep(page,"Seguridad");
          const originalButton = recovery.getByRole("button", { name: "Consultar recuperación original", exact: true });
          await originalButton.waitFor({ timeout: 120_000 });
          expect(await consent.isChecked()).toBe(false);
          const originalResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/tribes/${slug}/messaging/notification-recovery-operations/${posts[0]!.operationId}`, { timeout: 120_000 });
          await originalButton.click();
          const response = await originalResponse, value = await response.json();
          expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toContain("no-store");
          expect(notificationRecoveryOperationSchema.safeParse(value).success).toBe(true);
          expect(value).toMatchObject({ state: "completed", operationId: posts[0]!.operationId, replayed: true });
          await recovery.getByRole("button", { name: "Preparar otra recuperación", exact: true }).waitFor({ timeout: 120_000 });
          expect(posts).toHaveLength(1); expect(await consent.isChecked()).toBe(false);
          expect(providerRequests).toBe(0); expect(errors).toBe(0); expect(hydrationErrors).toBe(0);
          expect(await page.getByRole("button", { name: /Google/ }).count() + await page.getByRole("link", { name: /Google/ }).count()).toBe(0); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "notification-recovery-original-confirmed", [fixture.creation.sessionToken, secret, fixture.own.email, fixture.context.actorUserId], "notification-recovery-captures.json", { selector: captureSelector });
          const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ children: number; audits: number; reservations: number }>(sql`select (select count(*)::int from public.message_deliveries where recovery_of_delivery_id=${fixture.context.deliveryId}) as children,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${tribeId} and event_type='notification_delivery_recovered') as audits,(select count(*)::int from public.messaging_usage_reservations where tribe_id=${tribeId}) as reservations`)).rows[0]);
          expect(effects).toEqual({ children: 1, audits: 1, reservations: fixture.baselineUsage.reservations });
        } finally { try { await page.unrouteAll({ behavior: "ignoreErrors" }); } finally { await context.close(); await browser.close(); } }
      }, { preloadModules: [join(process.cwd(), "tests/support/native-zavu-provider-transport.mjs")], environment: { ADMISSION_TEST_ZAVU_CREDENTIAL: randomUUID() }, messagingSecurity: { environment, securityEpoch, keyringsJson }, onProviderRequest: () => { providerRequests++; } }));
    });
  }, 1_200_000);
});
