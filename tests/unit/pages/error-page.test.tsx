import { vi, describe, it, expect, beforeEach } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ErrorPage from "@/app/error";
import PlatformError from "@/app/(platform)/error";
import { RECOVERED_SEGMENT_TEXT, renderThroughAppRouter } from "@/tests/support/app-router-error-boundary";

describe("ErrorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a safe Spanish fallback, logs the error and re-fetches the segment on retry", async () => {
    const user = userEvent.setup();
    const error = new Error("unexpected_failure");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(function () { return undefined; });

    // Mounted through the framework's own boundary: the button must use the `retry` App Router really passes.
    const segment = renderThroughAppRouter(ErrorPage, error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);

    expect(screen.getByText(/error inesperado/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /no pudimos cargar esta sección/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /volver al inicio/i })
    ).toHaveAttribute("href", "/");

    segment.recover();
    await act(async () => { await user.click(screen.getByRole("button", { name: /reintentar/i })); });

    expect(segment.refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(RECOVERED_SEGMENT_TEXT)).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it("recovers a platform section inside the shell without a second main landmark", async () => {
    const user = userEvent.setup();
    const error = new Error("unexpected_failure");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(function () { return undefined; });

    const segment = renderThroughAppRouter(PlatformError, error);

    // The shell already renders the page's <main>; the section only shows its recovery.
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /no pudimos cargar esta sección/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /volver al inicio/i })).toHaveAttribute("href", "/");

    segment.recover();
    await act(async () => { await user.click(screen.getByRole("button", { name: /reintentar/i })); });

    expect(segment.refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(RECOVERED_SEGMENT_TEXT)).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });
});
