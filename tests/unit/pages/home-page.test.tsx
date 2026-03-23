import { render, screen } from "@testing-library/react";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the scaffold hero content", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: /academiaonline esta lista para evolucionar hacia una plataforma online de comunidad enfocada/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /abrir base del panel/i })
    ).toHaveAttribute("href", "/dashboard");
  });
});
