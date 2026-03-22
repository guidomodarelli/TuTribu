import { expect, test } from "@playwright/test";

test("loads the home scaffold", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: /academiaonline is ready to evolve into a focused online community platform/i,
    })
  ).toBeVisible();
});

test("redirects anonymous users to Google sign-in before dashboard", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fdashboard/i);
  await expect(
    page.getByRole("heading", {
      name: /continue with google/i,
    })
  ).toBeVisible();
});
