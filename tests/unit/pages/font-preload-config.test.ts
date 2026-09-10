import { vi, describe, it, expect, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const googleFontLoaderImport = vi.fn(() => {
  throw new Error("Google font loader should not run during page module import.");
});

vi.mock("next/font/google", () => ({
  Geist: googleFontLoaderImport,
  IBM_Plex_Mono: googleFontLoaderImport,
  Poppins: googleFontLoaderImport,
}));

// next/font requires Next build-time transformation, unavailable in Vitest.
// Preserve the explicit font metadata adapter used by these rendering tests.
vi.mock("next/font/local", () => ({
  __esModule: true,
  default: () => ({
    className: "font-local-mock",
    style: { fontFamily: "font-local-mock" },
    variable: "font-local-mock",
  }),
}));

const FONT_DIRECTORY = join(process.cwd(), "app", "fonts");
const SELF_HOSTED_FONT_FILES = [
  "geist-latin-variable.woff2",
  "poppins-latin-600.woff2",
  "ibm-plex-mono-latin-400.woff2",
  "ibm-plex-mono-latin-500.woff2",
];
const globalStyles = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
/** Allows the real root layout's full dependency graph to load from a cold Vite cache. */
const MODULE_IMPORT_TIMEOUT_MS = 120_000;

describe("font preload config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps root and error page modules independent from Google font fetching", async () => {
    await import("@/app/layout");
    await import("@/app/global-error");

    expect(googleFontLoaderImport).not.toHaveBeenCalled();
  }, MODULE_IMPORT_TIMEOUT_MS);

  it("bundles the self-hosted fonts consumed by the typography tokens", () => {
    for (const fontFile of SELF_HOSTED_FONT_FILES) {
      expect(existsSync(join(FONT_DIRECTORY, fontFile))).toBe(true);
    }

    expect(globalStyles).toMatch(/--font-sans:\s*var\(--font-geist\);/);
    expect(globalStyles).toMatch(/--font-mono:\s*var\(--font-ibm-plex-mono\);/);
    expect(globalStyles).toMatch(/--font-heading:\s*var\(--font-geist\);/);
    expect(globalStyles).toMatch(/--font-display:\s*var\(--font-poppins\);/);
  });
});
