/** Moves through the linear messaging connection flow in a real browser the way a person does. @module messaging-connections-steps */
import type { Locator, Page } from "@playwright/test";
import { MESSAGING_CONNECTIONS_FLOW_COPY } from "@/src/modules/messaging/constants/messaging-connections-workspace";

/** Visible title prefix of the collapsed preserved tests, followed by their count. */
const PRESERVED_TESTS_TITLE = "Pruebas conservadas";
/** Prefix of the per-channel test steps ("Probar Correo"). */
const TEST_STEP_PREFIX = "Probar ";
/** Upper bound of Atrás/Siguiente presses; the flow has at most eight steps. */
const MAXIMUM_MOVES = 12;
/** Accessible name of the progress list, "Paso N de M". */
const PROGRESS_NAME = /^Paso \d+ de \d+$/;

/**
 * Opens a step with Atrás and Siguiente, or Security from its own toggle. "Pruebas" means the first channel test step.
 * @param page - Page showing the connection workspace.
 * @param name - Visible step title ("Clave", "Credencial", "Canales", "Probar SMS", "Activación"), "Pruebas" or "Seguridad".
 * @returns Once that step (or the security region) is visible; Siguiente stays disabled on a step whose write has not finished.
 */
export async function openConnectionsStep(page: Page, name: string): Promise<void> {
  const toggle = page.getByRole("button", { name: new RegExp(`^(${MESSAGING_CONNECTIONS_FLOW_COPY.security}|${MESSAGING_CONNECTIONS_FLOW_COPY.steps})$`) });
  if (name === MESSAGING_CONNECTIONS_FLOW_COPY.securityRegion) {
    if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
    await page.getByRole("region", { name, exact: true }).waitFor({ state: "visible" });
    return;
  }
  if (await toggle.getAttribute("aria-pressed") === "true") await toggle.click();
  for (let moves = 0; moves < MAXIMUM_MOVES; moves += 1) {
    const progress = page.getByRole("navigation", { name: PROGRESS_NAME });
    const labels = await progress.locator("[data-label]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-label") ?? ""));
    const current = await progress.getByRole("listitem").evaluateAll((items) => items.findIndex((item) => item.getAttribute("aria-current") === "step"));
    const target = name === "Pruebas" ? labels.findIndex((label) => label.startsWith(TEST_STEP_PREFIX)) : labels.indexOf(name);
    if (target < 0) throw new Error(`The connection flow has no step named ${name}: ${labels.join(", ")}`);
    if (target === current) { await page.getByRole("group", { name: labels[target], exact: true }).waitFor({ state: "visible" }); return; }
    await clickClearOfToasts(page.getByRole("button", { name: target > current ? MESSAGING_CONNECTIONS_FLOW_COPY.next : "Atrás", exact: true }));
    await page.waitForFunction((previous) => Array.from(document.querySelectorAll(`nav[aria-label^="Paso "] li`)).findIndex((item) => item.getAttribute("aria-current") === "step") !== previous, current);
  }
  throw new Error(`Could not reach the connection step ${name}`);
}

/**
 * Expands the collapsed recovery of preserved tests, as a person does before looking up an earlier emission.
 * @param page - Page showing the connection flow.
 * @returns Once the preserved references are visible; an expanded list is left as it is.
 */
export async function openPreservedTests(page: Page): Promise<void> {
  const disclosure = page.locator("details").filter({ hasText: PRESERVED_TESTS_TITLE });
  if (await disclosure.getAttribute("open") === null) await disclosure.locator("summary").click();
  await disclosure.getByRole("list").waitFor({ state: "visible" });
}

/**
 * Clicks a control after scrolling it to the middle of the viewport. Toasts sit at the top center of the app, so on a
 * narrow screen a control resting against the top edge can be covered by one; a person scrolls it into view first.
 * @param control - Visible control to press.
 * @returns Once the click was dispatched.
 */
export async function clickClearOfToasts(control: Locator): Promise<void> {
  await control.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await control.click();
}
