import { expect, type Page, test } from "@playwright/test";

const DARK_THEME_STORAGE_VALUE = "dark";
const LIGHT_THEME_STORAGE_VALUE = "light";
const NOT_FOUND_TEST_ROUTE = "/missing-route-for-dark-mode";
const THEME_MODE_STORAGE_KEY = "tutribu-theme";

async function getNotFoundBackdropImageForTheme(
  page: Page,
  themeMode: typeof DARK_THEME_STORAGE_VALUE | typeof LIGHT_THEME_STORAGE_VALUE
) {
  await page.addInitScript(
    ({ storageKey, storageValue }) => {
      window.localStorage.setItem(storageKey, storageValue);
    },
    {
      storageKey: THEME_MODE_STORAGE_KEY,
      storageValue: themeMode,
    }
  );
  await page.goto(NOT_FOUND_TEST_ROUTE);
  await expect(
    page.getByRole("heading", {
      name: /esta pagina no existe o ya no esta disponible/i,
    })
  ).toBeVisible();

  return page
    .locator("[data-testid='not-found-backdrop']")
    .evaluate(
      (backdropElement) => getComputedStyle(backdropElement).backgroundImage
    );
}

test("uses a theme-aware not found backdrop in dark mode", async ({ browser }) => {
  const [darkPage, lightPage] = await Promise.all([
    browser.newPage(),
    browser.newPage(),
  ]);

  const [darkBackdropImage, lightBackdropImage] = await Promise.all([
    getNotFoundBackdropImageForTheme(darkPage, DARK_THEME_STORAGE_VALUE),
    getNotFoundBackdropImageForTheme(lightPage, LIGHT_THEME_STORAGE_VALUE),
  ]);

  await expect(darkPage.locator("html")).toHaveClass(/dark/);
  expect(darkBackdropImage).not.toBe(lightBackdropImage);

  await darkPage.close();
  await lightPage.close();
});
