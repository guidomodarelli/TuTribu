/** @vitest-environment node */
/** Exercises a historical invitation URL through the real common admission UI in Chromium and WebKit at mobile and desktop widths. @module legacy-admission-browser-ui-tests */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { applyAdmissionMigrationJournal } from "@/tests/support/admission-migration-command";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { registerAdmissionOperationMacKeys } from "@/tests/support/admission-operation-mac-keys";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { LEGACY_ADMISSION_ARRIVAL } from "@/src/modules/academy-admissions/constants/legacy-admission-arrival";

const BROWSER_SURFACES = [
  { engine: chromium, width: 1280 },
  { engine: chromium, width: 390 },
  { engine: webkit, width: 1280 },
  { engine: webkit, width: 390 },
] as const;
const ACTION_TIMEOUT_MS = 180_000;
const SUITE_TIMEOUT_MS = 2_400_000;
/** Bytes of a historical invitation token; base64url renders them as the 43 characters the route accepts. */
const LEGACY_TOKEN_BYTES = 32;

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native historical invitation admission UI", () => {
  it("should open a historical invitation without effects and submit one legacy-sourced request across Chromium/WebKit at desktop/mobile widths", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await applyAdmissionMigrationJournal(database);
      const leaderId = randomUUID(), tribeId = randomUUID(), invitationId = randomUUID(), slug = `legacy-ui-${tribeId}`;
      const token = randomBytes(LEGACY_TOKEN_BYTES).toString("base64url");
      expect(LEGACY_ADMISSION_ARRIVAL.canonicalTokenPattern.test(token)).toBe(true);
      const applicants = BROWSER_SURFACES.map(() => ({ userId: randomUUID(), sessionId: randomUUID(), token: randomUUID() }));
      await database.withContext({ userId: leaderId, email: null }, async (transaction) => {
        const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        for (const userId of [leaderId, ...applicants.map((applicant) => applicant.userId)]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Participante sintético',${`${userId}@example.test`},false,${now},${now})`);
        for (const applicant of applicants) await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${applicant.sessionId},${applicant.userId},${applicant.token},clock_timestamp()+interval '1 hour',${now},${now})`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Academia sintética',${slug},${leaderId})`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active')`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at) values (${tribeId},true,${now})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${tribeId}`);
        // An impersonal invitation link from before admissions existed; only its hash is stored.
        await transaction.execute(sql`insert into public.tribe_invitations(id,tribe_id,token_hash,created_by,status,subscription_association_type) values (${invitationId},${tribeId},${createHash("sha256").update(token).digest("hex")},${leaderId},'active','free')`);
      });
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: "synthetic-legacy-ui", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      await registerAdmissionOperationMacKeys(database, await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson }));
      /** @param userId - Synthetic applicant. @returns Its requests in this academy with their source and historical invitation. */
      const readRequests = (userId: string) => database.withContext({ userId: leaderId, email: null }, async (transaction) => (await transaction.execute<{ source: string; legacy_invitation_id: string | null; status: string }>(sql`select source,legacy_invitation_id,status from public.academy_admission_requests where tribe_id=${tribeId} and user_id=${userId}`)).rows);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        for (const [index, { engine, width }] of BROWSER_SURFACES.entries()) {
          const applicant = applicants[index];
          const browser = await engine.launch({ headless: true }), context = await browser.newContext({ viewport: { width, height: 900 } });
          await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${applicant.token}.${await makeSignature(applicant.token, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
          const page = await context.newPage(), pageErrors: string[] = [];
          page.setDefaultTimeout(ACTION_TIMEOUT_MS); page.on("pageerror", () => pageErrors.push("pageerror"));
          try {
            await page.goto(`${origin}/admissions/${slug}/${LEGACY_ADMISSION_ARRIVAL.segment}/${token}`, { waitUntil: "domcontentloaded" });
            await page.getByRole("textbox", { name: ADMISSION_UI_COPY.message }).waitFor({ state: "visible" });
            // Opening the historical link is a read: no request, code, payment or membership yet.
            expect(await readRequests(applicant.userId)).toEqual([]);
            await page.getByRole("textbox", { name: ADMISSION_UI_COPY.message }).fill("Llegué por un enlace anterior de la academia.");
            await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent.trim() === "Continuar" && !button.disabled));
            await page.getByRole("button", { name: "Continuar", exact: true }).click();
            await page.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }).check();
            await page.getByRole("button", { name: ADMISSION_UI_COPY.submit, exact: true }).click();
            await expect.poll(() => readRequests(applicant.userId), { timeout: ACTION_TIMEOUT_MS }).toEqual([{ source: "legacy", legacy_invitation_id: invitationId, status: "pending" }]);
            expect(pageErrors).toEqual([]);
            expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
          } finally { await context.close(); await browser.close(); }
        }
        const memberships = await database.withContext({ userId: leaderId, email: null }, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.tribe_members where tribe_id=${tribeId} and role<>'leader'`)).rows[0].count);
        expect(memberships).toBe(0);
      }, { messagingSecurity }));
    });
  }, SUITE_TIMEOUT_MS);
});
