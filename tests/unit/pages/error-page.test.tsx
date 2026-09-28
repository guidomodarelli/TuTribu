import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ErrorPage from "@/app/error";

describe("ErrorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a safe Spanish fallback, logs the error and retries on demand", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const error = new Error("unexpected_failure");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(function () { return undefined; });

    render(<ErrorPage error={error} unstable_retry={retry} />);

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    consoleErrorSpy.mockRestore();

    expect(screen.getByText(/error inesperado/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /no pudimos cargar esta sección/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /volver al inicio/i })
    ).toHaveAttribute("href", "/");

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
