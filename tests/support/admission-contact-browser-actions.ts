/** Owns private code entry in native applicant tests without exposing Playwright call logs. @module admission-contact-browser-actions */
import type { Page } from "@playwright/test";

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
