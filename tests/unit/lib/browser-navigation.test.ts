import { afterEach, describe, expect, it } from "vitest";

import { replaceCurrentUrlSearchParams } from "@/lib/browser-navigation";

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
