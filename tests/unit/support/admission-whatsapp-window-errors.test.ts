/** @vitest-environment node */
/** Validates the error oracle through its public contracts and actual browser events without SDK mocks. @module admission-whatsapp-window-errors-tests */
import { createServer } from "node:http";
import { chromium, webkit } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { observeAdmissionWhatsappBrowserError } from "@/tests/support/admission-whatsapp-browser-errors";
import { classifyAdmissionWhatsappBrowserErrors, installAdmissionWhatsappWindowObserver, readAdmissionWhatsappWindowSnapshot, type AdmissionWhatsappTimedBrowserError, type AdmissionWhatsappWindowSnapshot } from "@/tests/support/admission-whatsapp-window-errors";
import { ADMISSION_WHATSAPP_BROWSER_PHASE as PHASE } from "@/tests/support/constants/admission-whatsapp-number";
import { ADMISSION_WHATSAPP_WINDOW_FAILURE as FAILURE, ADMISSION_WHATSAPP_WINDOW_OBSERVER as OBSERVER } from "@/tests/support/constants/admission-whatsapp-window-errors";

/** @returns A native diagnostic projected by the same public boundary used in the real flow test. */
function nativeDiagnostic(): AdmissionWhatsappTimedBrowserError {
  const url = "http://127.0.0.1:1234/api/auth/get-session", error = new Error(`${url.slice("http:".length)} due to access control checks.`);
  error.name = "Fetch API cannot load http";
  return { at: 1_000, observation: observeAdmissionWhatsappBrowserError(error, { phase: PHASE.personalNavigation, leaderSurface: false, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl: null, accountUrls: new Set([url]) }) };
}

/** @returns Complete synthetic lifecycle metadata for the public classifier contract. */
function completeSnapshot(): AdmissionWhatsappWindowSnapshot {
  return { available: true, count: 3, records: [{ kind: "realm_init", at: 500, realm: "1-1", top: true }, { kind: "pagehide", at: 1_014, realm: "1-1", top: true }, { kind: "realm_init", at: 1_019, realm: "2-2", top: true }] };
}

describe("WhatsApp browser error oracle", () => {
  it("should retain a calibrated retiring WebKit console event as a counted diagnostic", () => {
    expect(classifyAdmissionWhatsappBrowserErrors("webkit", [nativeDiagnostic()], 1, [{ leaderSurface: false, snapshot: completeSnapshot() }])).toEqual({ blocking: [], nativeRetirementDiagnostics: 1, windowExceptions: 0, unhandledRejections: 0 });
  });

  it.each(["chromium", "unknown"])("should keep the same native event blocking in %s", (engineName) => {
    expect(classifyAdmissionWhatsappBrowserErrors(engineName, [nativeDiagnostic()], 1, [{ leaderSurface: false, snapshot: completeSnapshot() }]).blocking).toContain(FAILURE.pageError);
  });

  it.each(["window_error", "unhandled_rejection"] as const)("should keep %s blocking beside a calibrated transport diagnostic", (kind) => {
    const snapshot = completeSnapshot();
    if (!snapshot.available) throw new Error("Synthetic complete snapshot unavailable");
    snapshot.records.push({ kind, at: 1_010, realm: "1-1", top: true }); snapshot.count += 1;
    expect(classifyAdmissionWhatsappBrowserErrors("webkit", [nativeDiagnostic()], 1, [{ leaderSurface: false, snapshot }]).blocking).toContain(kind === "window_error" ? FAILURE.exception : FAILURE.rejection);
  });

  it("should fail incomplete observation and native truncation", () => {
    expect(classifyAdmissionWhatsappBrowserErrors("webkit", [], 1, [{ leaderSurface: false, snapshot: { available: false } }]).blocking).toEqual([FAILURE.truncated, FAILURE.unavailable]);
    const snapshot = completeSnapshot();
    if (!snapshot.available) throw new Error("Synthetic complete snapshot unavailable");
    snapshot.count += 1;
    expect(classifyAdmissionWhatsappBrowserErrors("webkit", [nativeDiagnostic()], 1, [{ leaderSurface: false, snapshot }]).blocking).toEqual([FAILURE.truncated, FAILURE.pageError]);
  });

  it.each(["lifecycle", "other_surface", "stable_document", "frame_retirement", "wrong_phase", "other_transport", "unknown_exception"])("should keep %s outside the calibrated retirement category", (variation) => {
    const error = nativeDiagnostic(), snapshot = completeSnapshot();
    if (!snapshot.available) throw new Error("Synthetic complete snapshot unavailable");
    if (variation === "lifecycle") snapshot.records.splice(1, 1);
    if (variation === "other_surface") error.observation.leaderSurface = true;
    if (variation === "stable_document") error.at = 2_000;
    if (variation === "frame_retirement") snapshot.records[1].top = false;
    if (variation === "wrong_phase") error.observation.phase = PHASE.common;
    if (variation === "other_transport") error.observation.nativeSessionAccessControlDiagnostic = false;
    if (variation === "unknown_exception") error.observation = observeAdmissionWhatsappBrowserError(new TypeError("Synthetic JavaScript failure"), { phase: PHASE.personalNavigation, leaderSurface: false, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl: null, accountUrls: new Set() });
    snapshot.count = snapshot.records.length;
    expect(classifyAdmissionWhatsappBrowserErrors("webkit", [error], 1, [{ leaderSurface: false, snapshot }]).blocking).toContain(FAILURE.pageError);
  });
});

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("actual cross-document global error observation", () => {
  it.each([{ engineName: "chromium", engine: chromium }, { engineName: "webkit", engine: webkit }])("should block real exceptions and rejections in $engineName without confusing resource errors", async ({ engine }) => {
    const server = createServer((request, response) => {
      const address = new URL(request.url ?? "/", "http://localhost");
      response.setHeader("content-type", "text/html"); response.setHeader("cache-control", "no-store");
      if (address.pathname === "/control") response.end(`<!doctype html><body><script>const mode=${JSON.stringify(address.searchParams.get("mode"))};function fail(){if(mode==='rejection')void Promise.reject(new TypeError('Synthetic browser rejection'));else throw new TypeError('Synthetic browser exception')}if(mode==='pagehide')window.addEventListener('pagehide',fail);else setTimeout(fail,10);window.syntheticReady=true;</script>`);
      else response.end("<!doctype html><body>Destino de control</body>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Synthetic browser server address unavailable");
      const origin = `http://127.0.0.1:${address.port}`, browser = await engine.launch({ headless: true });
      try {
        for (const mode of ["error", "rejection", "pagehide"]) {
          const context = await browser.newContext();
          try {
            const page = await context.newPage(); await installAdmissionWhatsappWindowObserver(page);
            await page.goto(`${origin}/control?mode=${mode}`); await page.waitForFunction(() => (globalThis as unknown as Record<string, unknown>).syntheticReady === true);
            if (mode !== "pagehide") await expect.poll(async () => { const snapshot = await readAdmissionWhatsappWindowSnapshot(page); return snapshot.available && snapshot.records.some((record) => record.kind === (mode === "rejection" ? "unhandled_rejection" : "window_error")); }).toBe(true);
            await page.goto(`${origin}/next`);
            const snapshot = await readAdmissionWhatsappWindowSnapshot(page), result = classifyAdmissionWhatsappBrowserErrors("webkit", [], 0, [{ leaderSurface: false, snapshot }]);
            expect(result.blocking).toContain(mode === "rejection" ? FAILURE.rejection : FAILURE.exception);
          } finally { await context.close(); }
        }
        const context = await browser.newContext();
        try {
          const page = await context.newPage(); await installAdmissionWhatsappWindowObserver(page); await page.goto(`${origin}/next`);
          await page.evaluate(() => window.dispatchEvent(new Event("error")));
          const snapshot = await readAdmissionWhatsappWindowSnapshot(page);
          expect(snapshot.available && snapshot.records.some((record) => record.kind === "resource_error")).toBe(true);
          expect(classifyAdmissionWhatsappBrowserErrors("webkit", [], 0, [{ leaderSurface: false, snapshot }]).blocking).toEqual([]);
        } finally { await context.close(); }
        const interruptedContext = await browser.newContext();
        try {
          const page = await interruptedContext.newPage(); await installAdmissionWhatsappWindowObserver(page); await page.goto(`${origin}/next`);
          expect((await readAdmissionWhatsappWindowSnapshot(page)).available).toBe(true);
          await page.evaluate((storageKey) => {
            const previous = localStorage.getItem(storageKey);
            localStorage.setItem(storageKey, "invalid own observer envelope");
            window.dispatchEvent(new Event("error"));
            if (previous !== null) localStorage.setItem(storageKey, previous);
          }, OBSERVER.storageKey);
          await page.goto(`${origin}/next?new-realm`);
          expect(await readAdmissionWhatsappWindowSnapshot(page)).toEqual({ available: false });
          expect(classifyAdmissionWhatsappBrowserErrors("webkit", [], 0, [{ leaderSurface: false, snapshot: await readAdmissionWhatsappWindowSnapshot(page) }]).blocking).toContain(FAILURE.unavailable);
        } finally { await interruptedContext.close(); }
      } finally { await browser.close(); }
    } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
