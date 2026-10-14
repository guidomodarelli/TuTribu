import { describe, expect, it } from "vitest";

import { getPixelSnappedCenterOffset } from "@/hooks/use-pixel-snapped-centering";

describe("getPixelSnappedCenterOffset", () => {
  it("should keep an exact center when it already lands on a whole pixel", () => {
    expect(getPixelSnappedCenterOffset(1000, 400)).toBe(300);
  });

  it("should snap a half-pixel center down to the previous whole pixel", () => {
    expect(getPixelSnappedCenterOffset(927, 384)).toBe(271);
  });

  it("should snap a fractional element size to a whole-pixel offset", () => {
    expect(getPixelSnappedCenterOffset(927, 384.1)).toBe(271);
  });

  it("should never place the element above or left of the viewport when it overflows", () => {
    expect(getPixelSnappedCenterOffset(600, 900)).toBe(0);
  });
});
