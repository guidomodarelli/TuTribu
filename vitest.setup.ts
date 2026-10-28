/** Sets up browser test APIs while preserving native HTTP in Node integration suites. */
/// <reference types="node" />
import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { installExitedBrowserStdioRelease } from "./tests/e2e/support/release-exited-browser-stdio";
import { installReactWarningGuard } from "./tests/support/react-warning-guard";

installReactWarningGuard();

/** Native browser suites launch WebKit directly; on Windows its leftover network process would otherwise hang `browser.close()` after every test passed. */
if (process.env.RUN_ADMISSION_BROWSER_TESTS === "1") {
  const { webkit } = await import("@playwright/test");
  installExitedBrowserStdioRelease({ executablePaths: [webkit.executablePath()] });
}

const RELATIVE_TIME_ELEMENT_TAG = "relative-time";

/**
 * Installs a test double on a global object with the same descriptor a plain
 * assignment creates (writable, enumerable and configurable data property).
 *
 * @param target - Global object that receives the property.
 * @param name - Property name.
 * @param value - Test double to expose.
 */
function defineTestGlobal<Target extends object, Name extends keyof Target>(
  target: Target,
  name: Name,
  value: Target[Name]
): void {
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

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
  defineTestGlobal(globalThis, "ResizeObserver", ResizeObserverTestStub);
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

// Legacy `MediaQueryList` listener methods that older libraries still call;
// they are installed by name so the stub keeps the full browser shape.
const LEGACY_MEDIA_QUERY_LISTENER_METHODS = [
  "addListener",
  "removeListener",
] as const;

/**
 * Builds the jsdom `matchMedia` result for one query.
 *
 * @param query - Media query passed to `window.matchMedia`.
 * @returns A static list that reports reduced motion and never notifies.
 */
function createMediaQueryListStub(query: string): MediaQueryList {
  const mediaQueryList: Omit<
    MediaQueryList,
    (typeof LEGACY_MEDIA_QUERY_LISTENER_METHODS)[number]
  > = {
    addEventListener: () => undefined,
    dispatchEvent: () => false,
    matches: REDUCED_MOTION_MEDIA_QUERIES.has(query),
    media: query,
    onchange: null,
    removeEventListener: () => undefined,
  };

  for (const methodName of LEGACY_MEDIA_QUERY_LISTENER_METHODS) {
    Object.assign(mediaQueryList, { [methodName]: () => undefined });
  }

  return mediaQueryList as MediaQueryList;
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  defineTestGlobal(window, "matchMedia", function matchMediaTestStub(
    query: string
  ): MediaQueryList {
    return createMediaQueryListStub(query);
  });
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
  defineTestGlobal(window, "scrollTo", function scrollTo(): void {
    return undefined;
  });
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
  defineTestGlobal(globalThis, "fetch", vi.fn());
}
