/** @vitest-environment node */
/** Exercises actual browser instrumentation and authenticated font transport failures through safe test boundaries. @module admission-browser-privacy-tests */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { enterAdmissionVerificationCode } from "@/tests/support/admission-contact-browser-actions";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native browser private failure boundaries", () => {
  it("should enter a code in a real input and sanitize a disabled input failure without code or cause", async () => {
    const browser = await chromium.launch({ headless: true }), page = await browser.newPage();
    const code = "123456";
    try {
      await page.setContent('<main><label for="code">Código de ingreso</label><input id="code"></main>');
      await enterAdmissionVerificationCode(page, code);
      expect(await page.getByLabel("Código de ingreso").inputValue() === code).toBe(true);
      await page.getByLabel("Código de ingreso").evaluate((element) => { (element as HTMLInputElement).disabled = true; });
      page.setDefaultTimeout(100);
      let failure: unknown;
      try { await enterAdmissionVerificationCode(page, code); } catch (error) { failure = error; }
      expect(failure instanceof Error && !failure.message.includes(code)).toBe(true);
      expect(failure instanceof Error && failure.message === "Contact UI code entry was unavailable" && !("cause" in failure)).toBe(true);
    } finally { await browser.close(); }
  });

  it("should sanitize the real authenticated font GET failure without exporting the session cookie", async () => {
    if (!process.env.ADMISSION_CAPTURE_SNIPPET) throw new Error("Browser privacy fixture requires the real capture snippet");
    let fontRequests = 0, authenticatedFontRequests = 0;
    const cookie = randomUUID();
    const server = createServer((request, response) => {
      if (request.url === "/private-fixture.woff2") { fontRequests += 1; if (request.headers.cookie?.includes(cookie)) authenticatedFontRequests += 1; response.destroy(); return; }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><style>@font-face{font-family:PrivacyFixture;src:url("/private-fixture.woff2")}main{font-family:PrivacyFixture,sans-serif}</style><main>Captura sintética de privacidad</main>');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Browser privacy fixture loopback was unavailable");
    const browser = await chromium.launch({ headless: true }), context = await browser.newContext();
    try {
      await context.addCookies([{ name: "synthetic-session", value: cookie, domain: "127.0.0.1", path: "/" }]);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${address.port}`);
      let failure: unknown;
      try { await captureAdmissionReview(page, "private-font-error", [cookie], "private-error-captures.json"); } catch (error) { failure = error; }
      expect(fontRequests).toBeGreaterThan(1);
      expect(authenticatedFontRequests).toBe(fontRequests);
      expect(failure instanceof Error && !failure.message.includes(cookie)).toBe(true);
      expect(failure instanceof Error && failure.message === "Reviewer capture local font download failed" && !("cause" in failure)).toBe(true);
    } finally { await context.close(); await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
