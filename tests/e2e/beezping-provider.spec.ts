import { expect, test } from "@playwright/test";

/** Only the application's authenticated identity boundary is replaced. */
async function serveWidgetIdentity(page: import("@playwright/test").Page, enabled: boolean) {
  await page.route("**/api/siteping/identity", (route) => route.fulfill({
    json: { enabled, identity: enabled ? { name: "Reporte de prueba", email: "reporter@example.com" } : null, projectName: "tutribu" },
  }));
  await page.route(/\/api\/siteping\?/, (route) => route.fulfill({
    json: { feedbacks: [], total: 0, capabilities: { comments: false }, permissions: { canDeleteAll: false } },
  }));
}

test.afterEach(async ({ page }) => {
  // Release the application's document and any pending screenshot work before
  // the WebKit worker closes its browser process on Windows.
  await page.unrouteAll({ behavior: "wait" });
  await page.goto("about:blank");
});

test("authorized reporting tools use the real published widget and cancel annotation cleanly", async ({ page }) => {
  await serveWidgetIdentity(page, true);
  await page.goto("/auth/signin");
  await expect(page.locator("beezping-widget")).toHaveCount(1);
  const buttonPoint = await page.evaluate(() => ({ x: innerWidth - 40, y: innerHeight - 40 }));
  await expect.poll(() => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.localName, buttonPoint)).toBe("beezping-widget");
  // The production widget uses closed Shadow DOM. Interact as a user does,
  // through pointer and keyboard, without changing its shadow-root mode.
  await page.mouse.click(buttonPoint.x, buttonPoint.y);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const annotationOverlay = page.getByRole("application");
  await expect(annotationOverlay).toBeVisible();
  const target = await page.getByRole("heading", { level: 1 }).first().boundingBox();
  expect(target).not.toBeNull();
  await page.mouse.move(target!.x + 5, target!.y + 5);
  await page.mouse.down();
  await page.mouse.move(target!.x + Math.min(target!.width - 5, 80), target!.y + Math.min(target!.height - 5, 25), { steps: 5 });
  await page.mouse.up();
  const commentForm = page.locator('[role="dialog"][data-beezping-ignore="true"]:visible').filter({ has: page.locator("textarea") });
  await expect(commentForm).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(annotationOverlay).toHaveCount(0);
  await expect(page.locator('[role="dialog"][data-beezping-ignore="true"]:visible')).toHaveCount(0);
});

test("denied identity never mounts reporting tools", async ({ page }) => {
  await serveWidgetIdentity(page, false);
  const identityRead = page.waitForResponse("**/api/siteping/identity");
  await page.goto("/auth/signin");
  await identityRead;
  await expect(page.locator("beezping-widget")).toHaveCount(0);
});
