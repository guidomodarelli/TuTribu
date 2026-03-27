import { render, screen } from "@testing-library/react";

import HomePage from "@/app/(platform)/page";

describe("HomePage", () => {
  it("renders the friendly home hero content", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: /un espacio para aprender, compartir y crecer en comunidad/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /entra a tu cuenta para descubrir comunidades, conectar con otras personas y empezar a construir tu propio espacio/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /iniciar sesion/i })
    ).toHaveAttribute("href", "/auth/signin");
  });
});
