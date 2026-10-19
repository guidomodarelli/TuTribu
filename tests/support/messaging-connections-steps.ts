/** Opens a section of the messaging connection workspace in a real browser the way a person does. @module messaging-connections-steps */
import type { Page } from "@playwright/test";
import { MESSAGING_CONNECTIONS_STEPPER_COPY, MESSAGING_CONNECTIONS_TAB_LABEL } from "@/src/modules/messaging/constants/messaging-connections-workspace";

/**
 * Completed steps open from the stepper, the current step from the summary's "Ir a" button, and Security from its own
 * action; an open section is left as it is.
 * @param page - Page showing the connection workspace.
 * @param name - Visible name of the section, such as "Pruebas" or "Seguridad".
 * @returns Once the section's region is visible.
 */
export async function openConnectionsStep(page: Page, name: string): Promise<void> {
  const region = page.getByRole("region", { name, exact: true });
  if (await region.isVisible()) return;
  if (name === MESSAGING_CONNECTIONS_TAB_LABEL.security) await page.getByRole("button", { name: MESSAGING_CONNECTIONS_STEPPER_COPY.security, exact: true }).click();
  else {
    const step = page.getByRole("navigation", { name: MESSAGING_CONNECTIONS_STEPPER_COPY.label, exact: true }).getByRole("button", { name: new RegExp(`^${name}`) });
    if (await step.getAttribute("aria-disabled") === "true") await page.getByRole("button", { name: `Ir a ${name}`, exact: true }).click();
    else await step.click();
  }
  await region.waitFor({ state: "visible" });
}
