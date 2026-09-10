import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ErrorPage from "@/app/error";

describe("ErrorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a safe Spanish fallback and retries on demand", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    render(
      <ErrorPage
        error={new Error("unexpected_failure")}
        unstable_retry={retry}
      />
    );

    expect(screen.getByText(/error inesperado/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /no pudimos cargar esta seccion/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /volver al inicio/i })
    ).toHaveAttribute("href", "/");

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
