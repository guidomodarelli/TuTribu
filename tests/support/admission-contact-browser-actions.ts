/** Owns private code entry in native applicant tests without exposing Playwright call logs. @module admission-contact-browser-actions */
import type { Page } from "@playwright/test";
import { settleGuidedStep } from "@/tests/support/guided-steps-browser";

/** @param page - Actual owned browser page. @param code - Ephemeral received code, never retained in diagnostics. @returns After entering the code. @throws A fixed safe error without the private instrumentation cause. */
export async function enterAdmissionVerificationCode(page: Page, code: string): Promise<void> {
  try { await page.getByLabel("Código de ingreso", { exact: true }).fill(code); }
  catch {
    // Playwright can include the entered value in its call log; discard that private cause.
    throw new Error("Contact UI code entry was unavailable");
  }
}

/** @param page - Actual owned browser page. @param phone - Ephemeral contact, never retained in diagnostics. @returns After entering the phone. @throws A fixed safe error without the private instrumentation cause. */
export async function enterAdmissionVerificationPhone(page: Page, phone: string): Promise<void> {
  try { await page.getByLabel("Teléfono para este ingreso", { exact: true }).fill(phone); }
  catch {
    // Playwright can retain the entered contact in its call log; discard that private cause.
    throw new Error("Contact UI phone entry was unavailable");
  }
}

/** Time the applicant flow may take to confirm the native viewer before its first step can continue. */
const ADMISSION_FLOW_READY_TIMEOUT_MS = 180_000;

/** @param page - Actual owned browser page. @returns After the applicant's data step hands over to the code step. */
export async function continueToAdmissionCode(page: Page): Promise<void> {
  const next = page.getByRole("button", { name: "Continuar", exact: true });
  await next.waitFor({ state: "visible" });
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "Continuar" && !button.disabled), undefined, { timeout: ADMISSION_FLOW_READY_TIMEOUT_MS });
  await next.click();
  await settleGuidedStep(page);
}

/** @param page - Actual owned browser page. @returns With the code step's resend and delivery reads open; an expired or exhausted code already shows its resend outside the disclosure. */
export async function openAdmissionCodeOptions(page: Page): Promise<void> {
  const summary = page.getByText("¿No te llegó el código?", { exact: true }), resend = page.getByRole("button", { name: "Reenviar código", exact: true });
  await summary.or(resend).first().waitFor({ state: "visible" });
  if (!await summary.isVisible()) return;
  if (!await summary.evaluate((element) => element.parentElement instanceof HTMLDetailsElement && element.parentElement.open)) await summary.click();
}

/** @param page - Actual owned browser page. @returns After the applicant's data step hands over to the submission step of a flow without a code. */
export async function continueToAdmissionSubmission(page: Page): Promise<void> {
  await continueToAdmissionCode(page);
}
