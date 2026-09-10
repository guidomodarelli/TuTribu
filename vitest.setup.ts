import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const RELATIVE_TIME_ELEMENT_TAG = "relative-time";

class ResizeObserverTestStub implements ResizeObserver {
  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverTestStub;
}

// jsdom does not implement `window.matchMedia`; components that subscribe to a
// media query through `useSyncExternalStore` need a browser API stub.
// Reduce motion in behavioral tests; real animation lifecycles run in Playwright.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = function matchMediaTestStub(query: string): MediaQueryList {
    return {
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    };
  };
}

if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
      return false;
    };
  }

  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = function setPointerCapture(): void {
      return undefined;
    };
  }

  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture =
      function releasePointerCapture(): void {
        return undefined;
      };
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {
      return undefined;
    };
  }
}

if (
  globalThis.customElements &&
  !globalThis.customElements.get(RELATIVE_TIME_ELEMENT_TAG)
) {
  globalThis.customElements.define(
    RELATIVE_TIME_ELEMENT_TAG,
    class RelativeTimeElementTestStub extends HTMLElement {}
  );
}

global.fetch = vi.fn();
