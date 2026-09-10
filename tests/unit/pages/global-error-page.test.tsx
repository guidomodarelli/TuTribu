import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GlobalErrorPage from "@/app/global-error";

// next/font requires Next build-time transformation, unavailable in Vitest.
// Preserve the explicit font metadata adapter used by these rendering tests.
vi.mock("next/font/local", () => ({
  __esModule: true,
  default: () => ({
    className: "font-local-mock",
    style: { fontFamily: "font-local-mock" },
    variable: "font-local-mock",
  }),
}));

describe("GlobalErrorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a full-document fallback and retries on demand", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    render(
      <GlobalErrorPage
        error={new Error("unexpected_failure")}
        unstable_retry={retry}
      />
    );

    expect(screen.getByText(/error inesperado/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /algo salio mal al cargar tutribu/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /volver al inicio/i })
    ).toHaveAttribute("href", "/");

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("should restore the stored theme when the root layout is unavailable", () => {
    localStorage.setItem("tutribu-theme", "dark");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(function () { return undefined; });
    const retry = vi.fn();

    render(
      <GlobalErrorPage
        error={new Error("unexpected_failure")}
        unstable_retry={retry}
      />
    );

    expect(document.documentElement).toHaveClass("dark");
    expect(
      consoleErrorSpy.mock.calls.some(([message]) =>
        String(message).includes("Encountered a script tag")
      )
    ).toBe(false);

    consoleErrorSpy.mockRestore();
    localStorage.clear();
  });
});
