/** Exercises actual administrative keyboard selection, mixed decisions and uncertain original recovery in every configured engine/viewport. @module academy-admissions-e2e */
import { randomBytes, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatchBrowserDatabase, bindAdmissionBatchBrowserSession, submitAdmissionBatchBrowserRows } from "@/tests/support/admission-batch-browser-fixture";
import { validateAdmissionBatchBrowser } from "@/tests/support/admission-batch-browser-validation";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { ADMISSION_REVIEW_BROWSER_INTERACTION, ADMISSION_REVIEW_KEYBOARD_VALIDATION } from "@/tests/support/constants/admission-review-keyboard-validation";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

test.use({ contextOptions: { reducedMotion: "reduce" } });

test("should complete mixed and uncertain administrative decisions through native keyboard controls without duplicate effects", async ({ browser, context }, testInfo) => {
  test.setTimeout(ADMISSION_REVIEW_KEYBOARD_VALIDATION.testTimeoutMs);
  await withAcademyAdmissionDatabase(async (database) => {
    const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(MESSAGING_CRYPTO.keyBytes).toString("base64") }] }]; }));
    const messagingSecurity = { environment: "synthetic-admission-keyboard", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
    const security = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
    const fixture = await prepareAdmissionBatchBrowserDatabase(database, security, ["Persona de lote uno", "Persona de lote dos", "Persona de lote tres", "Persona de lote cuatro"], (phase) => process.stdout.write(JSON.stringify({ phase }) + "\n"));
    await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
      const applicant = await browser.newContext();
      try {
        await bindAdmissionBatchBrowserSession(context, fixture.guardian, origin, secret);
        const rows = await submitAdmissionBatchBrowserRows(applicant, fixture, origin, secret);
        const observations: Record<string, unknown> = {}, errors: string[] = [];
        const result = await validateAdmissionBatchBrowser({ context, origin, slug: fixture.slug, rows, interaction: ADMISSION_REVIEW_BROWSER_INTERACTION.keyboard, privateValues: [secret, ...Object.values(keyrings).flatMap((ring) => ring.keys.map((key) => key.materialBase64)), ...fixture.applicants.flatMap(({ identity }) => [identity.userId, identity.sessionId, identity.sessionToken, identity.email])], capture: false, artifactPath: testInfo.outputPath("administrative-keyboard-batch-recovered.png"), errors, observations, onStage: async (phase) => { process.stdout.write(JSON.stringify({ phase }) + "\n"); } });
        expect(result).toMatchObject({ originals: 2, mixedCompleted: 1, mixedConflicts: 1, lostResponseCommitted: true, recoveredOriginalReads: 1, recoveredResultSurvivedListFailure: true, originalRecoveryStopped: true, documentLoads: 2, realMessages: 0, interaction: "keyboard", accessibleResultSummaries: 2 });
      } finally { await applicant.close(); }
    }, { messagingSecurity }));
    const userIds = fixture.applicants.map(({ identity }) => identity.userId);
    const facts = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select
      (select count(*)::integer from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=any(${sql.param(userIds)}::text[]) and role='tribemate' and status='active') as basic_members,
      (select count(*)::integer from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and user_id=any(${sql.param(userIds)}::text[])) as decisions,
      (select count(*)::integer from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,
      (select count(*)::integer from public."user" where id=any(${sql.param(userIds)}::text[]) and "emailVerified") as global_verified`)).rows[0]);
    expect(facts).toEqual({ basic_members: 3, decisions: 4, deliveries: 0, global_verified: 0 });
  });
});
