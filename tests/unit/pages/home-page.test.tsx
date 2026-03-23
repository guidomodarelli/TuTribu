import { render, screen } from "@testing-library/react";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the scaffold hero content", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: /academiaonline centraliza el inicio de sesion y la base tecnica de la app/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /iniciar sesion/i })
    ).toHaveAttribute("href", "/auth/signin");
  });
});
