/** Verifies persisted themes and client navigation through the real application provider. */
import { expect, test } from "@playwright/test";
import { SIDEBAR_SHORTCUT_SEQUENCE, SIDEBAR_TOGGLE_SELECTOR } from "@/tests/constants/sidebar-validation";
import { ROUTES } from "@/src/constants/routes";

test("should ignore keyless events and preserve native sidebar shortcuts in the production application", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.name));

  // Arrange: the public home uses the same provider as the connection flow.
  await page.goto(ROUTES.home);
  // Server-rendered controls become visible before their browser listeners mount.
  // A real shared menu interaction establishes readiness without a fixed sleep.
  await page.getByRole("button", { name: "Cambiar tema" }).click();
  await page.getByRole("menuitemradio", { name: "Claro", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "Claro", exact: true })).toBeHidden();
  const toggle = page.locator(SIDEBAR_TOGGLE_SELECTOR);
  await expect(toggle).toBeVisible();
  const originalExpanded = await toggle.getAttribute("aria-expanded");
  expect(originalExpanded).toMatch(/^(?:true|false)$/u);

  // Act and assert: real key presses prove the listener is mounted in each engine.
  await page.keyboard.press(SIDEBAR_SHORTCUT_SEQUENCE[0]);
  await expect(toggle).toHaveAttribute("aria-expanded", String(originalExpanded !== "true"));
  await page.keyboard.press(SIDEBAR_SHORTCUT_SEQUENCE[1]);
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
