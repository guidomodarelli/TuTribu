/** @vitest-environment node */
/** Exercises anonymous return, wrong-account privacy, native sign-out and OFF canje in the real app across both engines. @module personal-invitation-entry-browser-ui-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native personal invitation entry and OFF UI", () => {
  it.concurrent.each([{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }])("should preserve login return, change the wrong account and confirm OFF without a code on $name at $width", async ({ name, engine, width }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-personal-entry-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const { fixture, applicant } = await prepareAllowlistAdmission(database, config), recipient = await applicant(), other = await applicant(), slug = `allowlist-${fixture.tribeId}`;
      for (const migration of ["20261009130000_add_personal_invitation_context_digest.sql", "20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261008220000_scope_admission_operation_recovery.sql"]) await database.applyMigration(migration);
      const invitations = new PostgresPersonalInvitationRepository((_scope, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Invitación personal de prueba", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Personal OFF UI fixture did not create initial material");
      const token = created.initialToken, invitationId = created.result.invitationId;
      const sessions = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string; token: string }>(sql`select id,token from public.session where id in (${recipient.sessionId},${other.sessionId})`)).rows);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browser = await engine.launch({ headless: true }), browserContext = await browser.newContext({ viewport: { width, height: 900 } }), page = await browserContext.newPage();
        const failures: string[] = []; let challenges = 0, submissions = 0;
        page.setDefaultTimeout(180_000); page.on("pageerror", (error) => failures.push(error.name));
        page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/challenges")) challenges += 1; if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/submissions")) submissions += 1; });
        const path = `/admissions/invitations/${token}`, forbidden = [token, recipient.userId, other.userId, recipient.email, other.email, secret, ...sessions.map((session) => session.token)];
        /** @param sessionId - Exact owned native fixture session. @returns After replacing browser cookies without publishing any signed material. */
        const useSession = async (sessionId: string) => { const session = sessions.find((candidate) => candidate.id === sessionId); if (!session) throw new Error("Personal entry native session unavailable"); try { await browserContext.clearCookies(); const value = `${session.token}.${await makeSignature(session.token, secret)}`; await browserContext.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(value), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]); } catch { throw new Error("Personal entry native cookie placement unavailable"); } };
        const open = async () => { try { await page.goto(origin + path, { waitUntil: "domcontentloaded" }); } catch { throw new Error("Personal entry UI navigation unavailable"); } };
        try {
          await open(); await page.getByRole("link", { name: "Iniciar sesión", exact: true }).waitFor({ state: "visible" });
          expect((await page.getByRole("link", { name: "Iniciar sesión", exact: true }).getAttribute("href")) === `/auth/signin?callbackUrl=${encodeURIComponent(path)}`).toBe(true);
          expect(challenges).toBe(0); expect(submissions).toBe(0);
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "personal-sign-in", forbidden, "personal-entry-captures.json");
          await useSession(other.sessionId); await open();
          await page.getByText("No podemos continuar con esta invitación desde esta cuenta. Podés cambiar de cuenta o usar otra vía de ingreso.", { exact: true }).waitFor({ state: "visible" });
          expect(await page.getByRole("button", { name: "Confirmar invitación", exact: true }).count()).toBe(0);
          expect((await page.locator("main").textContent())?.includes(recipient.email)).toBe(false);
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "personal-wrong-account", forbidden, "personal-entry-captures.json");
          try { await page.getByRole("button", { name: "Cambiar de cuenta", exact: true }).click(); await page.waitForURL((url) => url.pathname === "/auth/signin", { waitUntil: "domcontentloaded" }); }
          catch { throw new Error("Personal entry account-change navigation unavailable"); }
          expect(new URL(page.url()).searchParams.get("callbackUrl") === path).toBe(true); expect(challenges).toBe(0); expect(submissions).toBe(0);
          await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]); });
          await useSession(recipient.sessionId); await open();
          await page.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i }).click();
          expect(await page.getByRole("button", { name: "Enviar código de ingreso", exact: true }).count()).toBe(0);
          await page.getByRole("button", { name: "Confirmar invitación", exact: true }).click();
          await page.getByRole("link", { name: "Abrir academia", exact: true }).waitFor({ state: "visible" });
          expect(challenges).toBe(0); expect(submissions).toBe(1); expect(failures).toEqual([]);
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
          await database.withContext(fixture.own, async (transaction) => { expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2 }]); expect((await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ role: "tribemate", status: "active" }]); });
          if (name === "chromium" && width === 1280) await captureAdmissionReview(page, "personal-admitted", forbidden, "personal-entry-captures.json");
        } finally { await browserContext.close(); await browser.close(); }
      }, { messagingSecurity }));
    });
  }, 1_200_000);
});
