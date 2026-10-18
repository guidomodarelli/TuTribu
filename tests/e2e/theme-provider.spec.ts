/** Verifies persisted themes and client navigation through the real application provider. */
import { expect, test } from "@playwright/test";
import { APP_RAIL_TOGGLE_SELECTOR, APP_RAIL_SHORTCUT_KEY, APP_RAIL_MOBILE_TOGGLE_LABEL, APP_RAIL_HYDRATION_ATTEMPT_MS, APP_RAIL_HYDRATION_TIMEOUT_MS } from "@/tests/constants/app-rail-validation";
import { ROUTES } from "@/src/constants/routes";
import { UI_TEST_ORIGIN, UI_TEST_SESSION_COOKIE_NAME, UI_TEST_SESSION_ENV } from "../../scripts/e2e/ui-test-environment.mjs";
import { runPrivateBrowserRequest } from "@/tests/support/private-browser-request";

test("should ignore keyless events and preserve the current application rail shortcut", async ({ page, context }) => {
  const sessionCookie = process.env[UI_TEST_SESSION_ENV.sessionCookie] ?? "", tribeSlug = process.env[UI_TEST_SESSION_ENV.tribeSlug] ?? "";
  test.skip(!sessionCookie || !tribeSlug, "Necesita la sesión aislada que prepara pnpm test:ui.");
  await runPrivateBrowserRequest("bind_app_rail_validation_cookie", () => context.addCookies([{ httpOnly: true, name: UI_TEST_SESSION_COOKIE_NAME, sameSite: "Lax", url: UI_TEST_ORIGIN, value: sessionCookie }]));
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.name));

  await page.goto(ROUTES.tribes.bySlug(tribeSlug));
  const toggle = page.locator(APP_RAIL_TOGGLE_SELECTOR);
  await expect(toggle).toBeVisible();
  const originalExpanded = await toggle.getAttribute("aria-expanded");
  expect(originalExpanded).toMatch(/^(?:true|false)$/u);
  const mobile = await toggle.getAttribute("aria-label") === APP_RAIL_MOBILE_TOGGLE_LABEL;

  // A real shortcut must work before the malformed event can count as an ignored event.
  await expect(async () => {
    await page.keyboard.press(APP_RAIL_SHORTCUT_KEY);
    await expect(toggle).toHaveAttribute("aria-expanded", String(originalExpanded !== "true"), { timeout: APP_RAIL_HYDRATION_ATTEMPT_MS });
  }).toPass({ timeout: APP_RAIL_HYDRATION_TIMEOUT_MS });
  // The mobile dialog owns its keyboard while open; Escape restores the navigation trigger.
  await page.keyboard.press(mobile ? "Escape" : APP_RAIL_SHORTCUT_KEY);
  await expect(toggle).toHaveAttribute("aria-expanded", originalExpanded!);

  await page.evaluate(() => window.dispatchEvent(new Event("keydown")));
  await expect(toggle).toHaveAttribute("aria-expanded", originalExpanded!);
  expect(runtimeErrors).toEqual([]);

  // A subsequent user action still operates after the malformed browser event.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", String(originalExpanded !== "true"));
  expect(runtimeErrors).toEqual([]);
});

test("should restore the legacy theme, persist changes and navigate without reloading", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (/hydration|hydrated/i.test(message.text())) hydrationErrors.push(message.text());
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("tutribu-theme")) localStorage.setItem("tutribu-theme", "dark");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Cambiar tema" }).click();
  await expect(page.getByRole("menuitemradio", { name: "Oscuro", exact: true })).toBeChecked();
  await page.getByRole("menuitemradio", { name: "Claro", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("tutribu-theme"))).toBe("light");
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.goto("/auth/route-not-found-for-ui-check");
  await expect(page.getByRole("heading", { name: "Esta página no existe o ya no está disponible" })).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.navigationProbe = "preserved"; });
  await page.getByRole("link", { name: "Volver al inicio", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("data-navigation-probe", "preserved");
  expect(hydrationErrors).toEqual([]);
});

test("should follow the system only while system mode is selected", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "Cambiar tema" }).click();
  await page.getByRole("menuitemradio", { name: "Sistema", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Cambiar tema" }).click();
  await page.getByRole("menuitemradio", { name: "Claro", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
