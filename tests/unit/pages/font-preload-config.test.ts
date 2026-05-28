import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const googleFontLoaderImport = jest.fn(() => {
  throw new Error("Google font loader should not run during page module import.");
});

jest.mock("next/font/google", () => ({
  IBM_Plex_Mono: googleFontLoaderImport,
  Space_Grotesk: googleFontLoaderImport,
}));

// next/font loaders only run through the Next build-time SWC plugin; in Jest
// they cannot execute. next/jest auto-maps next/font to its own mock, but in
// this Next version that mock leaves the `next/font/local` default export
// non-callable, so importing the self-hosted font module throws. Provide a
// minimal callable stub, mirroring the existing google loader mock above.
jest.mock("next/font/local", () => ({
  __esModule: true,
  default: () => ({
    className: "font-local-mock",
    style: { fontFamily: "font-local-mock" },
    variable: "font-local-mock",
  }),
}));

const FONT_DIRECTORY = join(process.cwd(), "app", "fonts");
const SELF_HOSTED_FONT_FILES = [
  "space-grotesk-latin-variable.woff2",
  "ibm-plex-mono-latin-400.woff2",
  "ibm-plex-mono-latin-500.woff2",
];
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

  it("bundles the self-hosted fonts consumed by the typography tokens", () => {
    for (const fontFile of SELF_HOSTED_FONT_FILES) {
      expect(existsSync(join(FONT_DIRECTORY, fontFile))).toBe(true);
    }

    expect(globalStyles).toMatch(/--font-sans:\s*var\(--font-space-grotesk\);/);
    expect(globalStyles).toMatch(/--font-mono:\s*var\(--font-ibm-plex-mono\);/);
    expect(globalStyles).toMatch(/--font-heading:\s*var\(--font-space-grotesk\);/);
  });
});
