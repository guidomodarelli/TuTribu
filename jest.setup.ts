import "@testing-library/jest-dom";

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
// media query through `useSyncExternalStore` need a never-matching stub so the
// subscription does not throw during tests.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = function matchMediaTestStub(query: string): MediaQueryList {
    return {
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
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

global.fetch = jest.fn();
