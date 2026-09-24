import { afterEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "@/lib/browser-clipboard";
import { replaceCurrentUrlSearchParams } from "@/lib/browser-navigation";

const LINK = "https://dev-tutribu.app/matematica-pro/eventos?event=abc";

describe("copyTextToClipboard", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
    Reflect.deleteProperty(document, "execCommand");
  });

  it("uses the async Clipboard API when the browser exposes it", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await expect(copyTextToClipboard(LINK)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it("falls back to a selected textarea when the Clipboard API is missing", async () => {
    let copiedText: string | null = null;
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        copiedText = document.querySelector("textarea")?.value ?? null;
        return true;
      }),
    });

    await expect(copyTextToClipboard(LINK)).resolves.toBe(true);
    expect(copiedText).toBe(LINK);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure when neither path can copy", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });

    await expect(copyTextToClipboard(LINK)).resolves.toBe(false);
  });
});

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
