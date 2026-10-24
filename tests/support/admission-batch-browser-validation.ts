/** Exercises real named batch decisions, a concurrent reviewer and recovery after a lost response. @module admission-batch-browser-validation */
import { randomUUID } from "node:crypto";
import { expect, type BrowserContext, type Request } from "@playwright/test";
import { admissionBatchResultSchema, type AdmissionBatchResultDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { admissionTransitionResultSchema } from "@/src/modules/academy-admissions/application/results/admission-writer-result-schemas";
import { ADMISSION_BATCH_REVIEW_COPY as COPY, ADMISSION_BATCH_REVIEW_RESULT_COPY } from "@/src/modules/academy-admissions/constants/admission-batch-review-ui";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_CONTEXTUAL_REFRESH_VALIDATION as VALIDATION } from "./constants/admission-contextual-refresh-validation";
import { captureAdmissionReview } from "./admission-review-capture";
import { runPrivateBrowserRequest } from "./private-browser-request";
import { createAdmissionReviewBrowserInteractions } from "./admission-review-browser-interactions";
import { ADMISSION_REVIEW_BROWSER_INTERACTION, type AdmissionReviewBrowserInteraction } from "./constants/admission-review-keyboard-validation";

/** Contains only the synthetic public selection created through the real submission endpoint. */
export type AdmissionBatchBrowserRow = { readonly requestId: string; readonly name: string };

/** Supplies an already owned branch/server/browser, without exposing any credentials to diagnostics. */
type AdmissionBatchBrowserValidationInput = {
  readonly context: BrowserContext; readonly origin: string; readonly slug: string;
  readonly rows: readonly AdmissionBatchBrowserRow[]; readonly privateValues: string[];
  readonly capture: boolean; readonly artifactPath: string; readonly errors: string[];
  readonly observations: Record<string, unknown>;
  readonly onStage: (stage: string) => Promise<void>;
  readonly interaction?: AdmissionReviewBrowserInteraction;
};

/**
 * Verifies the public route on the current native engine without replacing SDKs, clocks or persistence.
 * @param input - Exactly four new pending rows and a guardian's real session on a disposable branch.
 * @returns Safe observations of two originals; no request bodies, session material or personal contacts.
 */
export async function validateAdmissionBatchBrowser(input: AdmissionBatchBrowserValidationInput): Promise<Record<string, unknown>> {
  if (input.rows.length !== 4) throw new Error("Native admission batch validation requires four pending rows");
  const current = expect.configure({ timeout: VALIDATION.responseTimeoutMs });
  const page = await input.context.newPage();
  const interaction = input.interaction ?? ADMISSION_REVIEW_BROWSER_INTERACTION.pointer;
  const keyboard = interaction === ADMISSION_REVIEW_BROWSER_INTERACTION.keyboard;
  const actions = createAdmissionReviewBrowserInteractions(page, interaction);
  page.setDefaultTimeout(VALIDATION.responseTimeoutMs);
  const rootPath = `/api/tribes/${input.slug}/admissions`, batchPath = `${rootPath}/request-decisions`;
  const documents: string[] = [], operationReads: string[] = [], batchWrites: string[] = [];
  let serverComponentReads = 0, initialServerComponentReads = 0, accessibleResultSummaries = 0;
  const viewerRequestsAfterSecondPost = new WeakSet<Request>();
  input.observations.browserBatchFailures = 0; input.observations.browserBatchFinishes = 0;
  input.observations.viewerStartsAfterSecondPost = 0; input.observations.viewerFinishesAfterSecondPost = 0;
  const browserBatchStatuses: number[] = [], viewerStatusesAfterSecondPost: number[] = [];
  input.observations.browserBatchStatuses = browserBatchStatuses; input.observations.viewerStatusesAfterSecondPost = viewerStatusesAfterSecondPost;
  page.on("pageerror", (error) => input.errors.push(error.name));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest() && request.resourceType() === "document") documents.push("document");
    if (path === `/${input.slug}/academia/admissions` && request.headers().rsc === "1") serverComponentReads += 1;
    if (request.method() === "POST" && path === batchPath) { batchWrites.push("POST"); input.observations.batchPostCount = batchWrites.length; }
    if (request.method() === "GET" && path.startsWith(`${rootPath}/operations/`)) { operationReads.push(path.slice(`${rootPath}/operations/`.length)); input.observations.originalOperationGetCount = operationReads.length; }
    if (request.method() === "GET" && path === "/api/auth/get-session" && batchWrites.length === 2) { viewerRequestsAfterSecondPost.add(request); input.observations.viewerStartsAfterSecondPost = Number(input.observations.viewerStartsAfterSecondPost) + 1; }
  });
  page.on("requestfailed", (request) => { if (new URL(request.url()).pathname === batchPath) input.observations.browserBatchFailures = Number(input.observations.browserBatchFailures) + 1; });
  page.on("requestfinished", (request) => { if (new URL(request.url()).pathname === batchPath) input.observations.browserBatchFinishes = Number(input.observations.browserBatchFinishes) + 1; if (viewerRequestsAfterSecondPost.has(request)) input.observations.viewerFinishesAfterSecondPost = Number(input.observations.viewerFinishesAfterSecondPost) + 1; });
  page.on("response", (response) => { if (new URL(response.url()).pathname === batchPath) browserBatchStatuses.push(response.status()); if (viewerRequestsAfterSecondPost.has(response.request())) viewerStatusesAfterSecondPost.push(response.status()); });
  const outcomes: { mixed: AdmissionBatchResultDto | null; lost: AdmissionBatchResultDto | null } = { mixed: null, lost: null };
  let concurrentDecisionConfirmed = false, failedListReads = 0;
  /** @param rows - Explicit currently visible names. @returns After a trusted native selection and confirmation. */
  const confirm = async (rows: readonly AdmissionBatchBrowserRow[]) => {
    for (const row of rows) {
      const checkbox = page.getByRole("checkbox", { name: `${COPY.selectPrefix} ${row.name}`, exact: true });
      await current(checkbox).toBeEnabled(); await actions.check(checkbox);
    }
    const form = page.getByRole("region", { name: COPY.title, exact: true });
    for (const row of rows) await current(form.getByText(row.name, { exact: true })).toBeVisible();
    await actions.fill(form.getByLabel(new RegExp(`^${ADMISSION_REVIEW_UI_COPY.internalReasonRequired}`)), "Revisión explícita de prueba controlada");
    const confirmation = form.getByRole("checkbox", { name: COPY.confirmation, exact: true });
    if (keyboard) await current(confirmation).not.toBeChecked();
    await actions.check(confirmation);
    await current(form.getByRole("button", { name: COPY.approve, exact: true })).toBeEnabled();
  };
  /**
   * Captures settled controls without freezing an outgoing button label.
   * @param name - Actual visible capture.
   * @param selector - Optional focused rendered region.
   * @returns After the real accessible control and its visual label have settled.
   */
  const capture = async (name: string, selector?: string) => {
    if (!input.capture) return;
    const readControl = page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read, exact: true });
    await current(readControl).toBeEnabled();
    await current(readControl.getByText(ADMISSION_REVIEW_UI_COPY.reading, { exact: true })).toHaveCount(0);
    await current(readControl.getByText(ADMISSION_REVIEW_UI_COPY.read, { exact: true })).toHaveCSS("opacity", "1");
    await captureAdmissionReview(page, name, input.privateValues, VALIDATION.batchCaptureFile, selector ? { selector } : {});
  };
  try {
    await input.onStage("open_native_batch_reviewer");
    await runPrivateBrowserRequest("open_native_batch_reviewer", () => page.goto(`${input.origin}/${input.slug}/academia/admissions`, { waitUntil: "domcontentloaded" }));
    await page.bringToFront();
    await current(page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read, exact: true })).toBeEnabled();
    initialServerComponentReads = serverComponentReads;
    await confirm(input.rows.slice(0, 2));
    if (!keyboard) await page.getByRole("button", { name: COPY.approve, exact: true }).click({ trial: true });
    await capture("admission-batch-confirmation");
    await input.onStage("submit_native_batch_with_concurrent_reviewer");
    await page.route((url) => url.pathname === batchPath, async (route) => {
      await runPrivateBrowserRequest("interleave_native_single_decision", async () => {
        const response = await input.context.request.post(`${input.origin}${rootPath}/requests/${input.rows[1].requestId}/decision`, { timeout: VALIDATION.responseTimeoutMs, headers: { origin: input.origin }, data: { operationId: randomUUID(), confirmed: true, expectedVersion: 1, decision: "reject", internalReason: "Decisión concurrente de prueba controlada" } });
        input.observations.concurrentDecisionStatus = response.status();
        if (!response.ok()) { const error = admissionPublicErrorSchema.safeParse(await response.json()); input.observations.concurrentDecisionErrorCode = error.success ? error.data.code : "unusable_public_error"; }
        await input.onStage("record_native_concurrent_decision_result");
        if (response.status() !== 200) throw new Error("Native concurrent decision was not confirmed");
        const transition = admissionTransitionResultSchema.parse(await response.json());
        expect(transition).toMatchObject({ admissionRequestId: input.rows[1].requestId, status: "rejected", version: 2 });
        concurrentDecisionConfirmed = true;
      });
      await input.onStage("forward_native_batch_after_concurrent_decision");
      await runPrivateBrowserRequest("forward_native_mixed_batch", async () => {
        const response = await route.fetch({ timeout: VALIDATION.responseTimeoutMs });
        input.observations.mixedHttpStatus = response.status();
        if (response.ok()) {
          outcomes.mixed = admissionBatchResultSchema.parse(await response.json());
          input.observations.mixedState = outcomes.mixed.state;
          input.observations.mixedSummary = outcomes.mixed.result;
          input.observations.mixedRowStates = outcomes.mixed.items.map((item) => item.status);
        } else { const error = admissionPublicErrorSchema.safeParse(await response.json()); input.observations.mixedErrorCode = error.success ? error.data.code : "unusable_public_error"; }
        await route.fulfill({ response });
        await input.onStage("record_native_mixed_http_result");
      });
    }, { times: 1 });
    await actions.activate(page.getByRole("button", { name: COPY.approve, exact: true }));
    await input.onStage("await_native_concurrent_decision_confirmation");
    await current.poll(() => concurrentDecisionConfirmed).toBe(true);
    await input.onStage("await_native_batch_response_after_concurrent_confirmation");
    await current.poll(() => input.observations.mixedHttpStatus !== undefined).toBe(true);
    expect(input.observations.mixedHttpStatus).toBe(200);
    await input.onStage("observe_native_mixed_batch_feedback");
    const results = page.getByRole("region", { name: COPY.results, exact: true });
    /** @param summary - Confirmed status, independent of the live list. @param rows - Names from its immutable authorized manifest. @returns After browser accessibility exposes status/names without private fixture values. */
    const assertAccessibleResult = async (summary: string, rows: readonly AdmissionBatchBrowserRow[]) => {
      if (!keyboard) return;
      await current(results.getByRole("status")).toHaveText(summary);
      const snapshot = await results.ariaSnapshot();
      expect(snapshot.includes(summary)).toBe(true);
      for (const row of rows) expect(snapshot.includes(row.name)).toBe(true);
      expect(input.privateValues.some((value) => value.length > 0 && snapshot.includes(value))).toBe(false);
      accessibleResultSummaries += 1;
    };
    await current(results.getByText(ADMISSION_BATCH_REVIEW_RESULT_COPY.mixed, { exact: true })).toBeVisible();
    await input.onStage("check_native_mixed_batch_public_result");
    expect(input.observations.mixedHttpStatus).toBe(200);
    expect(concurrentDecisionConfirmed).toBe(true);
    expect(outcomes.mixed).toMatchObject({ state: "completed", result: "mixed", completedCount: 1, failedCount: 1, unresolvedCount: 0 });
    expect(outcomes.mixed?.items).toEqual(expect.arrayContaining([{ requestId: input.rows[0].requestId, status: "approved", version: 2, safeMessage: "Solicitud aprobada." }, { requestId: input.rows[1].requestId, status: "conflict", code: "request_conflict", safeMessage: ADMISSION_ERROR_MESSAGE.request_conflict }]));
    for (const row of input.rows.slice(0, 2)) await current(results.getByRole("heading", { name: row.name, exact: true })).toBeVisible();
    await assertAccessibleResult(ADMISSION_BATCH_REVIEW_RESULT_COPY.mixed, input.rows.slice(0, 2));
    await capture("admission-batch-mixed-results", `[aria-label="${COPY.results}"]`);
    await actions.activate(results.getByRole("button", { name: COPY.dismiss, exact: true }));
    await actions.activate(page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read, exact: true }));
    await confirm(input.rows.slice(2));
    await input.onStage("lose_native_batch_response_after_real_commit");
    await page.route((url) => url.pathname === batchPath, async (route) => {
      try {
        await runPrivateBrowserRequest("lose_native_committed_batch_response", async () => {
          const response = await route.fetch({ timeout: VALIDATION.responseTimeoutMs });
          input.observations.lostResponseHttpStatus = response.status();
          if (!response.ok()) { const error = admissionPublicErrorSchema.safeParse(await response.json()); input.observations.lostResponseErrorCode = error.success ? error.data.code : "unusable_public_error"; }
          else outcomes.lost = admissionBatchResultSchema.parse(await response.json());
          await route.abort("failed");
        });
      } catch {
        input.observations.lostResponseTransportFailed = true;
        await route.abort("failed");
      }
      await input.onStage("record_native_lost_response_result");
    }, { times: 1 });
    await actions.activate(page.getByRole("button", { name: COPY.approve, exact: true }));
    await input.onStage("await_native_second_batch_request");
    await current.poll(() => batchWrites.length).toBe(2);
    await input.onStage("await_native_second_batch_server_confirmation");
    await current.poll(() => outcomes.lost !== null || input.observations.lostResponseHttpStatus !== undefined || input.observations.lostResponseTransportFailed === true).toBe(true);
    expect(input.observations.lostResponseTransportFailed).not.toBe(true);
    expect(input.observations.lostResponseHttpStatus).toBe(200);
    await input.onStage("observe_native_uncertain_committed_batch");
    await current(page.getByText(COPY.uncertain, { exact: true })).toBeVisible();
    if (keyboard) {
      await current(page.getByRole("region", { name: COPY.title, exact: true }).getByRole("status").filter({ hasText: COPY.uncertain })).toBeVisible();
      expect(serverComponentReads).toBe(initialServerComponentReads);
    }
    await current(page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read, exact: true })).toBeEnabled();
    input.observations.lostResponseRecoveryControlEnabled = true;
    expect(outcomes.lost).toMatchObject({ state: "completed", result: "all_succeeded", completedCount: 2, failedCount: 0, unresolvedCount: 0 });
    expect(outcomes.lost?.items.map((item) => item.requestId).sort()).toEqual(input.rows.slice(2).map((row) => row.requestId).sort());
    expect(batchWrites).toHaveLength(2); expect(operationReads).toHaveLength(0);
    await capture("admission-batch-uncertain");
    await input.onStage("recover_native_batch_after_reload_and_list_failure");
    await page.route((url) => url.pathname === `${rootPath}/requests`, async (route) => {
      failedListReads += 1;
      const error = admissionPublicErrorSchema.parse({ code: ADMISSION_ERROR_CODE.dependencyUnavailable, message: ADMISSION_ERROR_MESSAGE.dependency_unavailable, requestId: randomUUID() });
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify(error) });
    }, { times: 1 });
    await runPrivateBrowserRequest("reload_native_batch_recovery", () => page.reload({ waitUntil: "domcontentloaded" }));
    await current(results.getByText(ADMISSION_BATCH_REVIEW_RESULT_COPY.all_succeeded, { exact: true })).toBeVisible();
    for (const row of input.rows.slice(2)) await current(results.getByRole("heading", { name: row.name, exact: true })).toBeVisible();
    await current(page.getByRole("alert").filter({ hasText: ADMISSION_ERROR_MESSAGE.dependency_unavailable })).toBeVisible();
    await assertAccessibleResult(ADMISSION_BATCH_REVIEW_RESULT_COPY.all_succeeded, input.rows.slice(2));
    expect(failedListReads).toBe(1);
    expect(operationReads).toEqual([outcomes.lost?.operationId]);
    expect(batchWrites).toHaveLength(2);
    expect(documents).toHaveLength(2);
    if (keyboard) expect(serverComponentReads).toBe(initialServerComponentReads);
    await capture("admission-batch-recovered-results");
    await results.screenshot({ path: input.artifactPath });
    await input.onStage("stop_native_original_recovery_after_terminal_result");
    await actions.activate(page.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read, exact: true }));
    await current(page.getByRole("alert").filter({ hasText: ADMISSION_ERROR_MESSAGE.dependency_unavailable })).toHaveCount(0);
    await current(results).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, VALIDATION.terminalObservationMs));
    expect(operationReads).toEqual([outcomes.lost?.operationId]); expect(batchWrites).toHaveLength(2); expect(documents).toHaveLength(2);
    expect(input.errors).toHaveLength(0);
    if (keyboard) expect(serverComponentReads).toBe(initialServerComponentReads);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    return { originals: batchWrites.length, mixedCompleted: outcomes.mixed?.completedCount, mixedConflicts: outcomes.mixed?.failedCount, lostResponseCommitted: outcomes.lost?.state === "completed", recoveredOriginalReads: operationReads.length, recoveredResultSurvivedListFailure: failedListReads === 1, originalRecoveryStopped: true, documentLoads: documents.length, perOriginalSelection: 2, realMessages: 0, interaction, accessibleResultSummaries };
  } catch (error) {
    try { await page.screenshot({ path: input.artifactPath.replace("-batch-recovered.png", "-batch-failure.png"), fullPage: true }); input.observations.failureScreenshotCaptured = true; }
    catch { input.observations.failureScreenshotCaptured = false; }
    throw error;
  } finally { await page.close(); }
}
