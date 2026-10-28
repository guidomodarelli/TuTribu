/** Measures ten independent, genuine password-account sessions against the actual manual/OFF entry flow. @module admission-entry-sample-e2e */
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, webkit, test, expect, type Browser, type BrowserContext } from "@playwright/test";
import { sql } from "drizzle-orm";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { prepareAdmissionEntrySampleDatabase } from "@/tests/support/admission-entry-sample-database";
import { prepareAdmissionEntrySampleSessions } from "@/tests/support/admission-entry-sample-auth";
import { evaluateAdmissionEntrySample, type AdmissionEntrySampleObservation } from "@/tests/support/admission-entry-sample-result";
import { ADMISSION_ENTRY_SAMPLE as SAMPLE, ADMISSION_ENTRY_SAMPLE_FAILURE as FAILURE, ADMISSION_ENTRY_SAMPLE_PHASE as PHASE } from "@/tests/support/constants/admission-entry-sample";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";
import { installAdmissionWhatsappWindowObserver, readAdmissionWhatsappWindowSnapshot } from "@/tests/support/admission-whatsapp-window-errors";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { admissionOutcomeSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_UI_COPY as COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { buildAdmissionEntryRoute } from "@/lib/academy-admissions/admission-routes";
import { HTTP_STATUS } from "@/src/constants/http-status";

/** Owns the resources acquired for each synthetic account, including partial setup. */
type CohortPosition = { alias: string; browser: "chromium" | "webkit"; width: number; context: BrowserContext };

test("should confirm at least nine of ten independent synthetic entries strictly below two minutes", async () => {
  const testInfo = test.info();
  const observations: (AdmissionEntrySampleObservation & { phase: string; responseStatus: number | null; replayConfirmed: boolean })[] = [];
  const report: Record<string, unknown> = {
    method: SAMPLE.method, humanUsability: false, googleVerification: false, externalDelivery: false,
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
    criterionMs: SAMPLE.completionLimitMs, observations,
  };
  const browsers: Browser[] = [], positions: CohortPosition[] = [];
  let cleanupFailures: number;
  try {
    const engines = [chromium, webkit];
    for (const [index, engine] of engines.entries()) {
      const browser = await engine.launch({ headless: true }); browsers.push(browser);
      const browserName = index === 0 ? "chromium" : "webkit";
      for (let position = 0; position < SAMPLE.accounts / engines.length; position += 1) {
        const width = SAMPLE.widths[position % SAMPLE.widths.length];
        const context = await browser.newContext({ viewport: { width, height: SAMPLE.viewportHeight } });
        positions.push({ alias: `A${String(positions.length + 1).padStart(2, "0")}`, browser: browserName, width, context });
      }
    }
    expect(positions).toHaveLength(SAMPLE.accounts);
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => {
        const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(MESSAGING_CRYPTO.keyBytes).toString("base64") }] }];
      }));
      const messagingSecurity = { environment: SAMPLE.securityEnvironment, securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const security = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionEntrySampleDatabase(database, security);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
        const identities = await prepareAdmissionEntrySampleSessions(environment, origin, secret, positions.map((position) => position.context));
        const identityCounts = { accounts: new Set(identities.map((identity) => identity.userId)).size, sessions: new Set(identities.map((identity) => identity.sessionId)).size };
        report.identities = identityCounts;
        process.stdout.write(JSON.stringify({ stage: "native_password_accounts_created", ...identityCounts }) + "\n");
        const submissionUrl = `${origin}/api/tribes/${fixture.slug}/admissions/submissions`;
        for (const position of positions) {
          const page = await position.context.newPage();
          const observation = { alias: position.alias, browser: position.browser, width: position.width, sessionVerified: true, durationMs: null as number | null, externalDeliveryWaitMs: 0 as const, confirmed: false, failure: null as AdmissionEntrySampleObservation["failure"], phase: PHASE.prepared as string, responseStatus: null as number | null, replayConfirmed: false };
          observations.push(observation);
          let pageErrors = 0;
          page.on("pageerror", () => { pageErrors += 1; });
          await installAdmissionWhatsappWindowObserver(page);
          const startedAt = performance.now();
          /** @returns The remaining whole action budget; no step can restart the two-minute clock. */
          const remaining = () => { const budget = SAMPLE.completionLimitMs - (performance.now() - startedAt); if (budget <= 0) throw new Error(FAILURE.deadline); return Math.ceil(budget); };
          try {
            observation.phase = PHASE.navigation;
            await page.goto(`${origin}${buildAdmissionEntryRoute(fixture.slug)}`, { waitUntil: "domcontentloaded", timeout: remaining() });
            observation.phase = PHASE.message;
            await page.getByRole("textbox", { name: COPY.message, exact: true }).fill(SAMPLE.message, { timeout: remaining() });
            observation.phase = PHASE.confirmation;
            const confirmation = page.getByRole("checkbox", { name: COPY.confirm, exact: true });
            await expect(confirmation).toBeEnabled({ timeout: remaining() });
            await confirmation.scrollIntoViewIfNeeded({ timeout: remaining() });
            await confirmation.setChecked(true, { timeout: remaining() });
            observation.phase = PHASE.submission;
            const [response] = await Promise.all([
              page.waitForResponse((reply) => reply.url() === submissionUrl && reply.request().method() === "POST", { timeout: remaining() }),
              page.getByRole("button", { name: COPY.submit, exact: true }).click({ timeout: remaining() }),
            ]);
            observation.responseStatus = response.status();
            observation.phase = PHASE.pending;
            await page.getByRole("heading", { name: COPY.statusTitle, exact: true }).waitFor({ state: "visible", timeout: remaining() });
            await page.getByText(COPY.pending, { exact: true }).waitFor({ state: "visible", timeout: remaining() });
            observation.durationMs = Math.ceil(performance.now() - startedAt);
            const result = admissionOutcomeSchema.safeParse(await response.json());
            const body = response.request().postDataJSON() as { operationId?: unknown };
            if (!result.success || result.data.outcome !== "pending" || result.data.operationId !== body.operationId
              || (response.status() !== HTTP_STATUS.created && response.status() !== HTTP_STATUS.ok)) throw new Error(FAILURE.requestUnconfirmed);
            const snapshot = await readAdmissionWhatsappWindowSnapshot(page);
            if (pageErrors || !snapshot.available || snapshot.records.some((record) => record.kind === "window_error" || record.kind === "unhandled_rejection")) {
              observation.failure = "browser_error";
            } else observation.confirmed = true;
            observation.phase = PHASE.replay;
            const replay = await runPrivateBrowserRequest("entry_sample_original_replay", () => position.context.request.post(submissionUrl, { headers: { origin }, data: body, timeout: SAMPLE.requestTimeoutMs }));
            try {
              const replayResult = admissionOutcomeSchema.safeParse(await replay.json());
              observation.replayConfirmed = replay.status() === HTTP_STATUS.ok && replayResult.success && replayResult.data.outcome === "pending"
                && replayResult.data.operationId === result.data.operationId && replayResult.data.request.id === result.data.request.id;
              if (!observation.replayConfirmed) throw new Error(FAILURE.recoveryUnconfirmed);
            } finally { await replay.dispose(); }
            observation.phase = PHASE.completed;
          } catch {
            observation.durationMs ??= Math.ceil(performance.now() - startedAt);
            observation.confirmed = false;
            observation.failure ??= "journey_failed";
          }
          process.stdout.write(JSON.stringify(observation) + "\n");
        }
        report.criterion = evaluateAdmissionEntrySample(observations, identityCounts);
        const userIds = identities.map((identity) => identity.userId);
        const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ requests: number; accounts: number; sessions: number; credentials: number; googleAccounts: number; deliveries: number; memberships: number }>(sql`select
          (select count(*)::integer from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=any(${sql.param(userIds)}::text[])) as requests,
          (select count(*)::integer from public."user" where id=any(${sql.param(userIds)}::text[])) as accounts,
          (select count(*)::integer from public.session where "userId"=any(${sql.param(userIds)}::text[])) as sessions,
          (select count(*)::integer from public.account where "userId"=any(${sql.param(userIds)}::text[]) and "providerId"='credential') as credentials,
          (select count(*)::integer from public.account where "userId"=any(${sql.param(userIds)}::text[]) and "providerId"='google') as "googleAccounts",
          (select count(*)::integer from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,
          (select count(*)::integer from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=any(${sql.param(userIds)}::text[])) as memberships`)).rows[0]);
        report.effects = effects;
        expect(effects).toEqual({ requests: SAMPLE.accounts, accounts: SAMPLE.accounts, sessions: SAMPLE.accounts, credentials: SAMPLE.accounts, googleAccounts: 0, deliveries: 0, memberships: 0 });
        expect(observations.every((observation) => observation.replayConfirmed)).toBe(true);
        expect(evaluateAdmissionEntrySample(observations, identityCounts).passed).toBe(true);
      }, { messagingSecurity }));
    });
    report.cleanupConfirmed = true;
  } finally {
    cleanupFailures = await closeCohortBrowsers(positions, browsers);
    report.browserCleanupFailures = cleanupFailures;
    const reportPath = testInfo.outputPath(SAMPLE.reportName);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    await testInfo.attach(SAMPLE.reportName, { path: reportPath, contentType: "application/json" });
  }
  if (cleanupFailures) throw new Error(FAILURE.browserCleanup);
});

/**
 * Closes every cohort context and browser, waiting for all of them even when some fail.
 * @param positions - Cohort positions whose contexts were opened, including partial setup.
 * @param browsers - Browsers launched for the cohort.
 * @returns How many contexts and browsers failed to close.
 */
async function closeCohortBrowsers(positions: CohortPosition[], browsers: Browser[]): Promise<number> {
  const contextsClosed = await Promise.allSettled(positions.map((position) => position.context.close()));
  const browsersClosed = await Promise.allSettled(browsers.map((browser) => browser.close()));
  return [...contextsClosed, ...browsersClosed].filter((result) => result.status === "rejected").length;
}
