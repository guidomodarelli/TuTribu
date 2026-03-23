import { expect, test } from "@playwright/test";

test("loads the home scaffold", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: /academiaonline esta lista para evolucionar hacia una plataforma online de comunidad enfocada/i,
    })
  ).toBeVisible();
});

test("redirects anonymous users to Google sign-in before dashboard", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fdashboard/i);
  await expect(
    page.getByRole("heading", {
      name: /continuar con google/i,
    })
  ).toBeVisible();
});
