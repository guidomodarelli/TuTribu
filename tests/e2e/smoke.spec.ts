import { expect, test } from "@playwright/test";

test("loads the home scaffold", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: /academiaonline centraliza el inicio de sesion y la base tecnica de la app/i,
    })
  ).toBeVisible();
});

test("loads Google sign-in page", async ({ page }) => {
  await page.goto("/auth/signin");

  await expect(page).toHaveURL(/\/auth\/signin/i);
  await expect(
    page.getByRole("heading", {
      name: /continuar con google/i,
    })
  ).toBeVisible();
});
