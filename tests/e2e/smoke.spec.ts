import { expect, test } from "@playwright/test";

test("loads the home scaffold", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: /academiaonline is ready to evolve into a focused online community platform/i,
    })
  ).toBeVisible();
});

test("loads the dashboard placeholder", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(
    page.getByRole("heading", {
      name: /a stable control room for the next product phase/i,
    })
  ).toBeVisible();
});
