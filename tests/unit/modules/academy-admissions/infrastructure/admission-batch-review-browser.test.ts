/** @vitest-environment node */
/** Verifies the real reviewer batch route independently from contextual refresh timing. @module admission-batch-review-browser-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatchBrowserDatabase, bindAdmissionBatchBrowserSession, submitAdmissionBatchBrowserRows } from "@/tests/support/admission-batch-browser-fixture";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { createAdmissionReviewHistoryTestError } from "@/tests/support/admission-review-history-diagnostics";
import { validateAdmissionBatchBrowser } from "@/tests/support/admission-batch-browser-validation";
import { ADMISSION_CONTEXTUAL_REFRESH_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-contextual-refresh-validation";
import { ADMISSION_ACTIVITY_VALIDATION as BROWSER } from "@/tests/support/constants/admission-activity-validation";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/** Each scenario owns its branch and browser; no shared environment receives a write. */
const scenarios = [{ name: "chromium", engine: chromium, width: 390 }, { name: "chromium", engine: chromium, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }];

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native named admission batches", () => {
  it.each(scenarios)("should decide and recover original batches on $name at $width without duplicate decisions or messages", async (scenario) => {
    let stage = "prepare_owned_batch_fixture";
    const observations: Record<string, unknown> = { engine: scenario.name, width: scenario.width, realMessages: 0, latencyGateCertified: false };
    const artifacts = process.env[VALIDATION.artifactEnvironment] ?? join(process.cwd(), "test-results", "admission-batch-review");
    await mkdir(artifacts, { recursive: true });
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
        const messagingSecurity = { environment: "synthetic-batch-review", securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
        const security = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
        const fixture = await prepareAdmissionBatchBrowserDatabase(database, security, ["Persona de lote uno", "Persona de lote dos", "Persona de lote tres", "Persona de lote cuatro"], (phase) => { stage = phase; });
        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
          const browser = await scenario.engine.launch({ headless: true });
          try {
            const reviewer = await browser.newContext({ viewport: { width: scenario.width, height: BROWSER.height }, reducedMotion: "reduce" });
            const applicant = await browser.newContext();
            await bindAdmissionBatchBrowserSession(reviewer, fixture.guardian, origin, secret);
            stage = "submit_new_native_batch_rows";
            const rows = await submitAdmissionBatchBrowserRows(applicant, fixture, origin, secret);
            const batch: Record<string, unknown> = {}, errors: string[] = [];
            observations.batch = batch; observations.pageErrorNames = errors;
            const validation = await validateAdmissionBatchBrowser({ context: reviewer, origin, slug: fixture.slug, rows, privateValues: [secret, ...fixture.applicants.flatMap(({ identity }) => [identity.userId, identity.sessionId, identity.sessionToken, identity.email])], capture: scenario.name === "chromium" && scenario.width === 1280, artifactPath: join(artifacts, `${scenario.name}-${scenario.width}-batch-recovered.png`), errors, observations: batch, onStage: async (phase) => { stage = phase; await appendFile(join(artifacts, `${scenario.name}-${scenario.width}-batch-trace.jsonl`), `${JSON.stringify({ at: new Date().toISOString(), stage, ...batch })}\n`, "utf8"); } });
            Object.assign(batch, validation);
            expect(validation).toMatchObject({ originals: 2 });
            await reviewer.close(); await applicant.close();
          } finally { await browser.close(); }
        }, { messagingSecurity }));
      });
      observations.branchOwnedAndRemovedByFixture = true; stage = "completed";
    } catch (error) { throw createAdmissionReviewHistoryTestError(error, `batch_review_${stage}`); }
    finally { await writeFile(join(artifacts, `${scenario.name}-${scenario.width}-result.json`), JSON.stringify({ ...observations, stage }, null, 2), "utf8"); }
  }, VALIDATION.testTimeoutMs);
});
