/** @vitest-environment node */
/** Exercises real WAAPI composition through the public manual capture boundary. @module admission-review-capture-tests */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1" || !process.env.ADMISSION_CAPTURE_SNIPPET)("actual animated manual capture", () => {
  it.each([{ engineName: "chromium", engine: chromium }, { engineName: "webkit", engine: webkit }])("should preserve visible composed styles without mutating the live element in $engineName", async ({ engine }) => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end('<!doctype html><main><button><span data-animated-label style="opacity:0;transform:translateY(8px);filter:blur(6px)">Confirmado</span></button></main>');
    });
    const outputFile = `animated-capture-${randomUUID()}.json`, outputPath = join(process.cwd(), "user-guides", "assets", "academy-admissions", outputFile);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Manual capture control address unavailable");
      const browser = await engine.launch({ headless: true });
      try {
        const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${address.port}`);
        const before = await page.evaluate(async () => {
          const element = document.querySelector<HTMLElement>("[data-animated-label]");
          if (!element) throw new Error("Animated control label unavailable");
          const animation = element.animate([{ opacity: 0, transform: "translateY(8px)", filter: "blur(6px)" }, { opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" }], { duration: 1, fill: "forwards" });
          await animation.finished;
          return { opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform, filter: getComputedStyle(element).filter, inlineOpacity: element.style.opacity, inlineTransform: element.style.transform, inlineFilter: element.style.filter };
        });
        expect(before).toMatchObject({ opacity: "1", filter: "blur(0px)", inlineOpacity: "0", inlineTransform: "translateY(8px)", inlineFilter: "blur(6px)" });
        await captureAdmissionReview(page, "animated-control", [], outputFile);
        const payload = JSON.parse(await readFile(outputPath, "utf8")) as { caps: { name: string; html: string }[] };
        const capture = payload.caps.find((candidate) => candidate.name === "animated-control");
        if (!capture) throw new Error("Animated control capture unavailable");
        const observed = await page.evaluate((html) => {
          const template = document.createElement("template"); template.innerHTML = html;
          const captured = template.content.querySelector<HTMLElement>("[data-animated-label]"), live = document.querySelector<HTMLElement>("[data-animated-label]");
          if (!captured || !live) throw new Error("Animated control comparison unavailable");
          return { opacity: captured.style.opacity, transform: captured.style.transform, filter: captured.style.filter, liveOpacity: live.style.opacity, liveTransform: live.style.transform, liveFilter: live.style.filter };
        }, capture.html);
        expect(observed).toEqual({ opacity: before.opacity, transform: before.transform, filter: before.filter, liveOpacity: before.inlineOpacity, liveTransform: before.inlineTransform, liveFilter: before.inlineFilter });
      } finally { await browser.close(); }
    } finally {
      try { try { await unlink(outputPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
      finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
    }
  });
});
