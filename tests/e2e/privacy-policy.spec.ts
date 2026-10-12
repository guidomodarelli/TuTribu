/** Exercises public privacy information and navigation through the actual production application. */
import { expect, test } from "@playwright/test";
import { ROUTES } from "@/src/constants/routes";
import { siteConfig } from "@/lib/site-config";

test("should expose privacy information without sign-in and link it from the homepage", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.name));
  const response = await page.goto(ROUTES.privacy);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Política de privacidad", exact: true })).toBeVisible();
  await expect(page.getByText(`Responsable del servicio: ${siteConfig.privacy.responsibleName}.`, { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: siteConfig.privacy.contactEmail, exact: true })).toHaveAttribute("href", `mailto:${siteConfig.privacy.contactEmail}`);
  await expect(page.getByRole("heading", { name: "Cuenta e inicio de sesión con Google", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

  await page.getByRole("link", { name: "Volver al inicio", exact: true }).click();
  await expect(page).toHaveURL(ROUTES.home);
  await page.getByRole("link", { name: "Política de privacidad", exact: true }).click();
  await expect(page).toHaveURL(ROUTES.privacy);
  await expect(page.getByRole("heading", { name: "Política de privacidad", exact: true })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});
