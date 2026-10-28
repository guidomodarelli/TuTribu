/** @vitest-environment node */
/** Exercises the published widget's real JPEG capture over rendered product controls in both browser engines. @module admission-private-widget-capture-tests */
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, webkit, type Page } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { ContactVerification } from "@/components/academy-admissions/contact-verification";
import { MessagingConnectionDiagnostic } from "@/components/academy-admissions/messaging-connection-diagnostic";
import { MessagingConnections } from "@/components/academy-admissions/messaging-connections";
import { MESSAGING_PRIVATE_CAPTURE_TEST_TIMEOUT_MS } from "@/tests/support/constants/messaging-private-capture";

/** Keeps presenter actions at their own boundary; capture never sends a product command. */
function ignoreAction() {}

/** @param name - Exact product surface under test. @returns Actual React/server-rendered controls, without fixture secrets in stored source. */
function productMarkup(name: string): string {
  if (name === "verification") return renderToStaticMarkup(<ContactVerification channel="email" phone="" country="" verificationCode="" confirmed={false} busy={false} canIssue={false} canVerify={false} canResend={false} canUseSmsAlternative={false} contactLocked={false} allowedCountries={[]} challenge={{ challengeId: randomUUID(), purpose: "admission", channel: "email", maskedDestination: "s•••@example.test", expiresAt: new Date(Date.now()).toISOString(), resendAllowedAt: new Date(Date.now()).toISOString(), deliveryState: "accepted" }} proofReady={false} expiresInSeconds={300} resendInSeconds={0} errorMessage={null} feedback={null} fieldErrors={{}} onPhoneChange={ignoreAction} onCountryChange={ignoreAction} onCodeChange={ignoreAction} onConfirm={ignoreAction} onIssue={ignoreAction} onResend={ignoreAction} onVerify={ignoreAction} onUseSmsAlternative={ignoreAction} />);
  if (name === "diagnostic") return renderToStaticMarkup(<MessagingConnectionDiagnostic channel="email" recipient="" country="" verificationCode="" confirmed={false} busy={false} canIssue={false} canVerify={false} allowedCountries={[]} usage={{ state: "not_configured", policy: null }} diagnostic={{ outcome: "issued", diagnosticId: randomUUID(), challengeId: randomUUID(), deliveryId: randomUUID(), connectionId: randomUUID(), connectionVersion: 1, channel: "email", maskedDestination: "s•••@example.test", expiresAt: new Date(Date.now()).toISOString(), resendAllowedAt: new Date(Date.now()).toISOString() }} delivery={null} fieldErrors={{}} onChannelChange={ignoreAction} onRecipientChange={ignoreAction} onCountryChange={ignoreAction} onCodeChange={ignoreAction} onConfirm={ignoreAction} onIssue={ignoreAction} onResend={ignoreAction} onVerify={ignoreAction} onReadDelivery={ignoreAction} />);
  return renderToStaticMarkup(<MessagingConnections configuration={{ audience: "leader", selected: null, candidate: null, usage: { state: "not_configured", policy: null } }} name="Conexión de ejemplo" apiKey="" confirmed={false} busy={false} canSave={false} validationConfirmed={false} canValidate={false} fieldErrors={{}} onNameChange={ignoreAction} onApiKeyChange={ignoreAction} onConfirmationChange={ignoreAction} onSave={ignoreAction} onValidationConfirmationChange={ignoreAction} onValidate={ignoreAction} />);
}

/** @param page - Real owned page with the published widget mounted. @param label - Product field selected by its accessible label. @returns Nothing after the widget submits its real capture to the owned HTTP sink. */
async function submitCapture(page: Page, label: string): Promise<void> {
  const input = page.getByLabel(label, { exact: true });
  await input.scrollIntoViewIfNeeded();
  const bounds = await input.boundingBox();
  if (!bounds) throw new Error("Private widget capture failed: product field unavailable");
  await page.locator("beezping-widget").waitFor({ state: "attached" });
  const point = await page.evaluate(() => ({ x: innerWidth - 40, y: innerHeight - 40 }));
  await page.waitForFunction(({ x, y }) => document.elementFromPoint(x, y)?.localName === "beezping-widget", point);
  await page.mouse.click(point.x, point.y);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("application").waitFor();
  await page.mouse.move(bounds.x + 2, bounds.y + 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + Math.max(3, bounds.width - 2), bounds.y + Math.max(3, bounds.height - 2), { steps: 5 });
  await page.mouse.up();
  const composer = page.locator('[role="dialog"][data-beezping-ignore="true"]:visible').filter({ has: page.locator("textarea") });
  await composer.waitFor();
  await composer.getByRole("button", { name: "Error", exact: true }).click();
  await composer.locator("textarea").fill("Comprobación de privacidad de una captura.");
  const sent = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/feedback");
  await composer.getByRole("button", { name: /Enviar/ }).click();
  await sent;
  await composer.waitFor({ state: "hidden" });
}

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("private product controls in real widget screenshots", () => {
  it.each([{ name: "chromium", engine: chromium, width: 1280 }, { name: "chromium", engine: chromium, width: 390 }, { name: "webkit", engine: webkit, width: 1280 }, { name: "webkit", engine: webkit, width: 390 }])("should omit codes and credential controls from real widget captures on $name at $width", async ({ engine, width }) => {
    const widget = await readFile(join(process.cwd(), "node_modules/@beezping/widget/dist/index.global.js"), "utf8");
    const captures: Array<string | null> = [];
    const server = createServer((request, response) => { void (async () => {
      if (request.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { screenshotDataUrl?: string };
        captures.push(typeof payload.screenshotDataUrl === "string" ? payload.screenshotDataUrl : null);
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ feedback: { id: randomUUID(), type: "bug", status: "open", comment: "Captura de prueba", createdAt: new Date().toISOString(), annotations: [] } }));
      } else if (request.url === "/widget.js") {
        response.setHeader("content-type", "text/javascript"); response.end(widget);
      } else if (request.url?.startsWith("/feedback")) {
        response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ feedbacks: [], total: 0, capabilities: { comments: false }, permissions: { canDeleteAll: false } }));
      } else {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(`<!doctype html><html lang="es"><head><style>body{font:16px sans-serif;margin:24px;background:white;color:black}input{display:block;font:24px monospace;min-height:36px}section{max-width:600px}button{margin:4px}</style></head><body><main><h1>Control privado del producto</h1>${productMarkup(request.url?.slice(1) ?? "")}</main><script src="/widget.js"></script><script>Beezping.initBeezping({endpoint:'/feedback',projectName:'tutribu',identity:{name:'Reporte de ejemplo',email:'reporter@example.test'},forceShow:true,enableScreenshot:true,captureDiagnostics:false,locale:'es',position:'bottom-right'});</script></body></html>`);
      }
    })(); });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Private widget capture failed: owned server unavailable");
    const browser = await engine.launch({ headless: true });
    try {
      for (const surface of [{ name: "verification", label: "Código de ingreso" }, { name: "diagnostic", label: "Código recibido" }, { name: "connection", label: "Clave de Zavu" }]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
        try {
          await page.goto(`http://127.0.0.1:${address.port}/${surface.name}`);
          const input = page.getByLabel(surface.label, { exact: true });
          await input.fill("222222");
          expect(await input.inputValue() === "222222").toBe(true);
          await submitCapture(page, surface.label);
          const first = captures.at(-1);
          expect(Boolean(first?.startsWith("data:image/jpeg;base64,"))).toBe(true);
          await input.fill("888888");
          await submitCapture(page, surface.label);
          expect(captures.at(-1) === first).toBe(true);
          // Positive control: removing the public exclusion must restore visible pixels.
          await input.evaluate((element) => { element.closest('[data-beezping-ignore="true"]')?.removeAttribute("data-beezping-ignore"); (element as HTMLInputElement).type = "text"; });
          await submitCapture(page, surface.label);
          expect(Boolean(captures.at(-1)) && captures.at(-1) !== first).toBe(true);
        } finally { await page.close(); }
      }
    } finally {
      await browser.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      captures.length = 0;
    }
  }, MESSAGING_PRIVATE_CAPTURE_TEST_TIMEOUT_MS);
});
