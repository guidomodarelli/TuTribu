/** Captures actual rendered reviewer DOM for the local manual with private fixture identities excluded. @module admission-review-capture */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";

/** @param page - Actual owned browser page. @param name - Stable manual capture name. @param forbidden - Fixture identity/session/token/secret strings never allowed in the export. @param outputFile - Trusted test-owned export filename within the admission manual assets. @param options - Optional visible app fragment and descendants omitted from that fragment. @returns Nothing when capture tooling is not explicitly selected; otherwise an actual sanitized DOM capture. */
export async function captureAdmissionReview(page: Page, name: string, forbidden: string[], outputFile = "review-captures.json", options: { selector?: string; omit?: string } = {}): Promise<void> {
  if (!process.env.ADMISSION_CAPTURE_SNIPPET) return;
  await page.evaluate(await readFile(process.env.ADMISSION_CAPTURE_SNIPPET, "utf8"));
  await page.evaluate(({ captureName, selector, omit, privateValues }) => {
    const helpers = window as unknown as { __umCap: (name: string, element: Element, options?: { transform?: (clone: Element) => void }) => { blockedSheets: string[] } };
    const root = Array.from(document.querySelectorAll(selector ?? "main")).find((element) => element.getClientRects().length > 0);
    if (!root) throw new Error("Visible reviewer capture root was unavailable");
    if (helpers.__umCap(captureName, root, { transform: (clone) => {
      if (omit) clone.querySelectorAll(omit).forEach((element) => element.remove());
      // Keep real labels while preventing a captured navigation target from retaining private route material.
      clone.querySelectorAll("a[href]").forEach((element) => { const href = element.getAttribute("href") ?? ""; if (privateValues.some((value) => value && (href.includes(value) || href.includes(encodeURIComponent(value))))) element.setAttribute("href", "#"); });
    } }).blockedSheets.length) throw new Error("Reviewer capture stylesheet was unavailable");
  }, { captureName: name, privateValues: forbidden, ...options });
  const payload = await page.evaluate((values) => {
    const helpers = window as unknown as { __umCheck: (forbidden: string[]) => unknown[] };
    if (helpers.__umCheck(values).length) throw new Error("Reviewer capture contained a private fixture identity");
    return { meta: { capturedAt: new Date().toISOString().slice(0, 10) }, rules: JSON.parse(sessionStorage.getItem("__umRules")!), caps: JSON.parse(sessionStorage.getItem("__umCaps")!) };
  }, forbidden);
  const origin = new URL(page.url()).origin;
  for (let ruleIndex = 0; ruleIndex < payload.rules.length; ruleIndex += 1) {
    const rule: string = payload.rules[ruleIndex];
    if (!rule.startsWith("@font-face")) continue;
    for (const font of rule.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (font[1].startsWith("data:")) continue;
      const url = new URL(font[1], origin);
      if (url.origin !== origin) throw new Error("Reviewer capture tried to embed an unrelated font origin");
      try {
        const response = await page.context().request.get(url.href);
        if (!response.ok()) throw new Error("Reviewer capture local font was unavailable");
        payload.rules[ruleIndex] = payload.rules[ruleIndex].replace(font[1], `data:font/woff2;base64,${(await response.body()).toString("base64")}`);
      } catch {
        // Context request errors can contain cookies; discard those private call logs at this export boundary.
        throw new Error("Reviewer capture local font download failed");
      }
    }
  }
  await writeFile(join(process.cwd(), "user-guides", "assets", "academy-admissions", outputFile), JSON.stringify(payload), "utf8");
}
