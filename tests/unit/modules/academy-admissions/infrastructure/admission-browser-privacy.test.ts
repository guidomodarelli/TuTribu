/** @vitest-environment node */
/** Exercises actual browser instrumentation and authenticated font transport failures through safe test boundaries. @module admission-browser-privacy-tests */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit, type Browser, type BrowserContext } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { enterAdmissionVerificationCode, enterAdmissionVerificationPhone } from "@/tests/support/admission-contact-browser-actions";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native browser private failure boundaries", () => {
  it.each([{ name: "chromium", engine: chromium }, { name: "webkit", engine: webkit }])("should redact a private phone in the capture while preserving its real disabled control on $name", async ({ engine }) => {
    const phone = "+5491155501234", filename = `privacy-input-${randomUUID()}.json`;
    const path = join(process.cwd(), "user-guides", "assets", "academy-admissions", filename);
    const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end('<main><label for="phone">Teléfono para este ingreso</label><input id="phone" type="tel" disabled><p>Destino: ••••1234</p></main>'); });
    let browser: Browser | null = null;
    try {
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Private phone fixture loopback was unavailable");
      browser = await engine.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.getByLabel("Teléfono para este ingreso").evaluate((element, value) => { (element as HTMLInputElement).value = value; }, phone);
      await captureAdmissionReview(page, "private-phone", [phone], filename);
      const artifact = JSON.parse(await readFile(path, "utf8"));
      expect(JSON.stringify(artifact).includes(phone)).toBe(false);
      await page.setContent(artifact.caps[0].html);
      expect(await page.getByLabel("Teléfono para este ingreso").isDisabled()).toBe(true);
      expect(await page.getByLabel("Teléfono para este ingreso").inputValue()).toBe("••••");
      expect(await page.getByText("Destino: ••••1234").isVisible()).toBe(true);
    } finally {
      try { await browser?.close(); }
      finally {
        try { if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
        finally { await rm(path, { force: true }); }
      }
    }
  });

  it("should enter a code in a real input and sanitize a disabled input failure without code or cause", async () => {
    const code = "123456";
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent('<main><label for="code">Código de ingreso</label><input id="code"></main>');
      await enterAdmissionVerificationCode(page, code);
      expect(await page.getByLabel("Código de ingreso").inputValue() === code).toBe(true);
      await page.getByLabel("Código de ingreso").evaluate((element) => { (element as HTMLInputElement).disabled = true; });
      page.setDefaultTimeout(100);
      let failure: unknown;
      try { await enterAdmissionVerificationCode(page, code); } catch (error) { failure = error; }
      expect(failure instanceof Error && !failure.message.includes(code)).toBe(true);
      expect(failure instanceof Error && failure.message === "Contact UI code entry was unavailable" && !("cause" in failure)).toBe(true);
    } finally { await browser?.close(); }
  });

  it.each([{ name: "chromium", engine: chromium }, { name: "webkit", engine: webkit }])("should enter a phone in its real control and sanitize a disabled input failure without contact or cause on $name", async ({ engine }) => {
    const phone = "+5491155501234";
    let browser: Browser | null = null;
    try {
      browser = await engine.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent('<main><label for="phone">Teléfono para este ingreso</label><input id="phone" type="tel"></main>');
      await enterAdmissionVerificationPhone(page, phone);
      expect(await page.getByLabel("Teléfono para este ingreso").inputValue() === phone).toBe(true);
      await page.getByLabel("Teléfono para este ingreso").evaluate((element) => { (element as HTMLInputElement).disabled = true; });
      page.setDefaultTimeout(100);
      let failure: unknown;
      try { await enterAdmissionVerificationPhone(page, phone); } catch (error) { failure = error; }
      expect(failure instanceof Error && !failure.message.includes(phone)).toBe(true);
      expect(failure instanceof Error && failure.message === "Contact UI phone entry was unavailable" && !("cause" in failure)).toBe(true);
    } finally { await browser?.close(); }
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
    let browser: Browser | null = null, context: BrowserContext | null = null;
    try {
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Browser privacy fixture loopback was unavailable");
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext();
      await context.addCookies([{ name: "synthetic-session", value: cookie, domain: "127.0.0.1", path: "/" }]);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${address.port}`);
      let failure: unknown;
      try { await captureAdmissionReview(page, "private-font-error", [cookie], "private-error-captures.json"); } catch (error) { failure = error; }
      expect(fontRequests).toBeGreaterThan(1);
      expect(authenticatedFontRequests).toBe(fontRequests);
      expect(failure instanceof Error && !failure.message.includes(cookie)).toBe(true);
      expect(failure instanceof Error && failure.message === "Reviewer capture local font download failed" && !("cause" in failure)).toBe(true);
    } finally {
      try { await context?.close(); }
      finally {
        try { await browser?.close(); }
        finally { if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
      }
    }
  });
});
