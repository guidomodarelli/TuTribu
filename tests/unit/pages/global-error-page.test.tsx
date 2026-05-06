import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GlobalErrorPage from "@/app/global-error";

describe("GlobalErrorPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders a full-document fallback and retries on demand", async () => {
    const user = userEvent.setup();
    const retry = jest.fn();

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
});
