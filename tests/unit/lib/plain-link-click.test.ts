import type { MouseEvent } from "react";
import { describe, it, expect } from "vitest";

import { isInPageLinkClick } from "@/lib/plain-link-click";

/** Builds the subset of a React anchor click the helper reads. */
function asAnchorClick(fields: Record<string, unknown>): MouseEvent<HTMLAnchorElement> {
  return fields as unknown as MouseEvent<HTMLAnchorElement>;
}

describe("isInPageLinkClick", () => {
  const plainClick = {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    shiftKey: false,
  };

  it("accepts a plain primary-button click", () => {
    expect(isInPageLinkClick(asAnchorClick(plainClick))).toBe(true);
  });

  it.each([
    ["the middle button", { button: 1 }],
    ["a ctrl click", { ctrlKey: true }],
    ["a cmd click", { metaKey: true }],
    ["a shift click", { shiftKey: true }],
    ["an alt click", { altKey: true }],
    ["an already handled click", { defaultPrevented: true }],
  ])("leaves %s to the browser", (_label, override) => {
    expect(isInPageLinkClick(asAnchorClick({ ...plainClick, ...override }))).toBe(false);
  });
});
