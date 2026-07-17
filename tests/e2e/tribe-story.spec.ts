import { expect, test } from "@playwright/test";

/**
 * Anonymous smoke over the public tribe story page: a tribe that does not
 * exist (or is not publicly joinable) must answer 404 without crashing the
 * anonymous render path, and the sitemap must keep serving.
 */
test("anonymous visitor gets a 404 for a non-joinable tribe story", async ({
  page,
}) => {
  const response = await page.goto("/tribu-inexistente-e2e/historia");

  expect(response?.status()).toBe(404);
});

test("sitemap responds with the static entries", async ({ request }) => {
  const response = await request.get("/sitemap.xml");

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("<urlset");
});
