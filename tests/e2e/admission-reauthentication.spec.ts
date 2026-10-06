/** Checks actual Next.js SSR, safe navigation and responsive feedback before any OAuth mutation. */
import { test, expect } from "@playwright/test";

const syntheticIntentId = "20ca5bf6-8517-4e0d-a7d7-24144fcb0ea8";

test("should reject a malformed intent with safe feedback in the actual global route", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.goto("/auth/reauthenticate?intentId=invalid&error=private-provider-text");
  await expect(page.getByRole("heading", { name: "No podemos confirmar esta acción" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Revisá los datos de la operación.");
  await expect(page.getByRole("button", { name: "Confirmar con Google" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/");
  await expect(page.getByText("private-provider-text")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("should keep the intent route visible when the global session is absent", async ({ page }) => {
  await page.goto(`/auth/reauthenticate?intentId=${syntheticIntentId}`);
  await expect(page.getByRole("heading", { name: "No podemos confirmar esta acción" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Iniciá sesión para continuar.");
  await expect(page.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/auth/signin");
  await expect(page).toHaveURL(new RegExp(`/auth/reauthenticate\\?intentId=${syntheticIntentId}$`));
  await expect(page.getByRole("button", { name: "Confirmar con Google" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
