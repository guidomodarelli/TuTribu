import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isBackForwardDocumentLoad,
  replaceCurrentUrlSearchParams,
} from "@/lib/browser-navigation";

describe("replaceCurrentUrlSearchParams", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("sets and removes one query parameter keeping the others", () => {
    window.history.replaceState(null, "", "/matematica-pro/eventos?month=2026-05");

    replaceCurrentUrlSearchParams({ event: "abc@2026" });

    expect(window.location.pathname).toBe("/matematica-pro/eventos");
    expect(new URL(window.location.href).searchParams.get("month")).toBe("2026-05");
    expect(new URL(window.location.href).searchParams.get("event")).toBe("abc@2026");

    replaceCurrentUrlSearchParams({ event: null });

    expect(window.location.search).toBe("?month=2026-05");
  });

  it("sets and removes several query parameters in one history entry", () => {
    window.history.replaceState(null, "", "/matematica-pro/eventos?event=abc%402026#detalle");
    const historyLength = window.history.length;

    replaceCurrentUrlSearchParams({ event: null, month: "2026-05" });

    expect(window.location.pathname).toBe("/matematica-pro/eventos");
    expect(window.location.search).toBe("?month=2026-05");
    expect(window.location.hash).toBe("#detalle");
    expect(window.history.length).toBe(historyLength);
  });
});

describe("isBackForwardDocumentLoad", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(performance, "navigation");
  });

  function stubNavigationEntries(entries: object[]) {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue(
      entries as PerformanceEntryList
    );
  }

  it("reports a document reached with Back or Forward", () => {
    stubNavigationEntries([{ entryType: "navigation", type: "back_forward" }]);

    expect(isBackForwardDocumentLoad()).toBe(true);
  });

  it("reports a regular navigation or reload as not coming from history", () => {
    stubNavigationEntries([{ entryType: "navigation", type: "navigate" }]);

    expect(isBackForwardDocumentLoad()).toBe(false);
  });

  it("falls back to the legacy navigation API when Navigation Timing has no entry", () => {
    stubNavigationEntries([]);
    Object.defineProperty(performance, "navigation", {
      configurable: true,
      value: { type: 2 },
    });

    expect(isBackForwardDocumentLoad()).toBe(true);
  });

  it("reports false when the browser exposes neither API", () => {
    stubNavigationEntries([]);

    expect(isBackForwardDocumentLoad()).toBe(false);
  });
});
