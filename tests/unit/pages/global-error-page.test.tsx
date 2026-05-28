import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GlobalErrorPage from "@/app/global-error";

// next/font loaders run through the Next build-time SWC plugin and cannot
// execute in Jest. next/jest auto-maps next/font, but in this Next version its
// mock leaves the next/font/local default export non-callable, so rendering the
// page (which loads self-hosted fonts) throws without this minimal stub.
jest.mock("next/font/local", () => ({
  __esModule: true,
  default: () => ({
    className: "font-local-mock",
    style: { fontFamily: "font-local-mock" },
    variable: "font-local-mock",
  }),
}));

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
