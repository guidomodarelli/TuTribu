import { describe, it, expect } from "vitest";
import { computeClampedFormPosition } from "@/components/providers/siteping-provider/siteping-form-placement";

const VIEWPORT = { viewportWidth: 1440, viewportHeight: 778 };
const MARGIN = 8;

describe("computeClampedFormPosition", () => {
  it("leaves a form that already fits untouched", () => {
    const result = computeClampedFormPosition({
      ...VIEWPORT,
      form: { top: 200, left: 500, width: 300, height: 284 },
      toolbar: null,
      margin: MARGIN,
    });

    expect(result).toEqual({ top: 200, left: 500 });
  });

  it("lifts a form whose bottom falls behind a bottom-pinned toolbar", () => {
    // Toolbar occupies 726..778; form bottom would be 757 (behind it).
    const result = computeClampedFormPosition({
      ...VIEWPORT,
      form: { top: 473, left: 527, width: 300, height: 284 },
      toolbar: { top: 726, bottom: 778 },
      margin: MARGIN,
    });

    // Clamped so the form bottom clears the toolbar: 726 - 8 - 284 = 434.
    expect(result.top).toBe(434);
    expect(result.left).toBe(527);
  });

  it("pushes a form down so it clears a top-pinned toolbar", () => {
    const result = computeClampedFormPosition({
      ...VIEWPORT,
      form: { top: 20, left: 500, width: 300, height: 200 },
      toolbar: { top: 0, bottom: 52 },
      margin: MARGIN,
    });

    expect(result.top).toBe(60); // 52 + margin
  });

  it("lifts a bottom-overflowing form even with the toolbar pinned at the top (no modal)", () => {
    // No modal: toolbar sits at the top (0..52). SitePing still anchors the form
    // low enough that its bottom (884) falls below the viewport.
    const result = computeClampedFormPosition({
      ...VIEWPORT,
      form: { top: 600, left: 500, width: 300, height: 284 },
      toolbar: { top: 0, bottom: 52 },
      margin: MARGIN,
    });

    // Bottom limit is the viewport edge (top toolbar does not block the bottom):
    // 778 - 8 - 284 = 486.
    expect(result.top).toBe(486);
  });

  it("clamps a form that overflows the right edge back inside", () => {
    const result = computeClampedFormPosition({
      ...VIEWPORT,
      form: { top: 200, left: 1300, width: 300, height: 200 },
      toolbar: null,
      margin: MARGIN,
    });

    expect(result.left).toBe(VIEWPORT.viewportWidth - MARGIN - 300); // 1132
  });

  it("keeps a form within the bare viewport when no toolbar is present", () => {
    const result = computeClampedFormPosition({
      ...VIEWPORT,
      form: { top: 700, left: 500, width: 300, height: 200 },
      toolbar: null,
      margin: MARGIN,
    });

    // Bottom limit is viewport - margin = 770; top = 770 - 200 = 570.
    expect(result.top).toBe(570);
  });
});
