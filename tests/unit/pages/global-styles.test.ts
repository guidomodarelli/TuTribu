import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const globalStyles = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

describe("global styles", () => {
  it("uses a theme-specific body background image for dark mode", () => {
    expect(globalStyles).toMatch(/--body-background-image:/);
    expect(globalStyles).toMatch(
      /\.dark\s*{[^}]*--body-background-image:[^}]*linear-gradient\(180deg,\s*oklch\(0\.145 0 0\),\s*oklch\(0\.205 0 0\)\)/s
    );
    expect(globalStyles).toMatch(
      /body\s*{[^}]*background-image:\s*var\(--body-background-image\);/s
    );
  });
});
