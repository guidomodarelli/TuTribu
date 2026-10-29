import { devices, type Project } from "@playwright/test";

/** Desktop and mobile viewports of both engines, so a spec covers Chromium and WebKit layouts alike. */
export const BROWSER_ENGINE_PROJECTS: Project[] = [
  { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
  { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
  { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
];
