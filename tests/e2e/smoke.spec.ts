import { expect, test } from "@playwright/test";

test("loads the home scaffold", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: /un espacio para aprender, compartir y crecer en tribu/i,
    })
  ).toBeVisible();
  await expect(
    page.locator("header").getByRole("button", { name: /(contraer|expandir) barra lateral/i })
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
  await expect(
    page.locator("header").getByRole("button", { name: /(contraer|expandir) barra lateral/i })
  ).toHaveCount(0);
});
