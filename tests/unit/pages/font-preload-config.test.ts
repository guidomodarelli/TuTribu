import { readFileSync } from "node:fs";
import { join } from "node:path";

const googleFontLoaderImport = jest.fn(() => {
  throw new Error("Google font loader should not run during page module import.");
});

jest.mock("next/font/google", () => ({
  IBM_Plex_Mono: googleFontLoaderImport,
  Space_Grotesk: googleFontLoaderImport,
}));

const globalStyles = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

describe("font preload config", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps root and error page modules independent from Google font fetching", async () => {
    await import("@/app/layout");
    await import("@/app/global-error");

    expect(googleFontLoaderImport).not.toHaveBeenCalled();
  });

  it("defines local font variables for the global typography tokens", () => {
    expect(globalStyles).toMatch(/--font-space-grotesk:\s*"Space Grotesk",\s*ui-sans-serif,\s*system-ui,\s*sans-serif;/);
    expect(globalStyles).toMatch(/--font-ibm-plex-mono:\s*"IBM Plex Mono",\s*ui-monospace,\s*"SFMono-Regular",\s*"Consolas",\s*monospace;/);
    expect(globalStyles).toMatch(/--font-sans:\s*var\(--font-space-grotesk\);/);
    expect(globalStyles).toMatch(/--font-mono:\s*var\(--font-ibm-plex-mono\);/);
  });
});
