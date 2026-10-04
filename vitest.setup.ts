/** Sets up browser test APIs while preserving native HTTP in Node integration suites. */
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
// Motion probes the bare `(prefers-reduced-motion)` feature query, while CSS and
// product code use the `: reduce` form, so both report the reduced preference.
const REDUCED_MOTION_MEDIA_QUERIES = new Set([
  "(prefers-reduced-motion: reduce)",
  "(prefers-reduced-motion)",
]);

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = function matchMediaTestStub(query: string): MediaQueryList {
    return {
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: REDUCED_MOTION_MEDIA_QUERIES.has(query),
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

if (typeof window !== "undefined") {
  // jsdom defines `window.scrollTo` but only reports "Not implemented". Motion
  // calls it to restore the scroll position after measuring keyframes (such as
  // `height: auto`); jsdom has no layout or scrolling, so there is nothing to
  // restore. Real scrolling and animation lifecycles run in Playwright.
  window.scrollTo = function scrollTo(): void {
    return undefined;
  };
}

/**
 * Cancels the activation of a link that would load another document. jsdom
 * does not implement cross-document navigation and only reports "Not
 * implemented"; tests assert destinations through `href` or the navigation
 * boundary in `lib/browser-navigation`. Same-document (hash) navigation, which
 * jsdom supports, is left untouched. The listener runs on `document`, after
 * React's root listener, so component handlers still see the original event.
 *
 * @param event - Click that bubbled up to the document.
 */
function cancelCrossDocumentLinkNavigation(event: MouseEvent): void {
  if (event.defaultPrevented || !(event.target instanceof Element)) {
    return;
  }

  const link = event.target.closest("a[href]");

  if (!(link instanceof HTMLAnchorElement)) {
    return;
  }

  const destination = new URL(link.href, window.location.href);
  const currentDocument = new URL(window.location.href);
  destination.hash = "";
  currentDocument.hash = "";

  if (destination.href !== currentDocument.href) {
    event.preventDefault();
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("click", cancelCrossDocumentLinkNavigation);
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

// Browser suites isolate HTTP at their transport boundary. Node integration
// suites retain native fetch to exercise real provider and database contracts.
if (typeof window !== "undefined") {
  global.fetch = vi.fn();
}
