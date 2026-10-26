/** Exercises the real rail and Next contexts against keyless and native keyboard events. @module app-rail-keyboard-tests */
import { act, cleanup, render, screen } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { describe, expect, it } from "vitest";
import { AppRailShell } from "@/components/app-rail/app-rail-shell";
import { APP_RAIL_DESKTOP_TOGGLE_LABEL_PATTERN, APP_RAIL_SHORTCUT_KEY, APP_RAIL_TEST_DESKTOP_WIDTH_PX, APP_RAIL_TEST_BFCACHE_ID } from "@/tests/constants/app-rail-validation";

describe("application rail keyboard contract", () => {
  it("ignores a keyless event after a working shortcut and preserves the next genuine key", () => {
    const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const browserErrors: string[] = [];
    /** @param event - Actual runtime failure under observation. @returns After retaining safe error identity for the assertion. */
    const observeError = (event: ErrorEvent) => { browserErrors.push(event.error instanceof Error ? event.error.name : event.type); event.preventDefault(); };
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => APP_RAIL_TEST_DESKTOP_WIDTH_PX });
    window.addEventListener("error", observeError);
    try {
      const router = { bfcacheId: APP_RAIL_TEST_BFCACHE_ID, back() {}, forward() {}, prefetch() {}, push() {}, refresh() {}, replace() {} };
      render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/"><AppRailShell authenticatedMember={null} defaultOpen memberTribes={[]}><p>Contenido de prueba</p></AppRailShell></PathnameContext.Provider></AppRouterContext.Provider>);
      const toggle = screen.getByRole("button", { name: APP_RAIL_DESKTOP_TOGGLE_LABEL_PATTERN });
      const expanded = toggle.getAttribute("aria-expanded");
      act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: APP_RAIL_SHORTCUT_KEY })); });
      expect(toggle).toHaveAttribute("aria-expanded", String(expanded !== "true"));
      act(() => { window.dispatchEvent(new Event("keydown")); });
      expect(toggle).toHaveAttribute("aria-expanded", String(expanded !== "true"));
      expect(browserErrors).toEqual([]);
      act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: APP_RAIL_SHORTCUT_KEY })); });
      expect(toggle).toHaveAttribute("aria-expanded", expanded);
    } finally {
      cleanup();
      window.removeEventListener("error", observeError);
      if (originalWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalWidth);
      else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    }
  });
});
