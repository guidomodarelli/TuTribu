/** Verifies persisted themes and client navigation through the real application provider. */
import { expect, test } from "@playwright/test";

test("should apply the packaged component styles in production", async ({ page }) => {
  await page.goto("/");
  const isTouch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  const trigger = page.locator('header [data-slot="sidebar-trigger"]');
  // Flex items compute inline-flex as flex inside the application's header layout.
  await expect(trigger).toHaveCSS("display", "flex");
  await expect(trigger).toHaveCSS("height", isTouch ? "40px" : "28px");
  const accessibleLabel = trigger.locator(".sr-only");
  await expect(accessibleLabel).toHaveCSS("position", "absolute");
  await expect(accessibleLabel).toHaveCSS("width", "1px");
  const themeButton = page.getByRole("button", { name: "Cambiar tema" });
  await expect(themeButton).toHaveCSS("display", "flex");
  await expect(themeButton).toHaveCSS("height", isTouch ? "40px" : "32px");
  await themeButton.click();
  const menu = page.getByRole("menu");
  await expect(menu).toHaveCSS("border-radius", "8px");
  await expect(menu).toHaveCSS("padding", "4px");
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
  await expect(page.getByRole("heading", { name: "Esta pagina no existe o ya no esta disponible" })).toBeVisible();
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
