import { render, screen } from "@testing-library/react";

import HomePage from "@/app/(platform)/page";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

describe("HomePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();

    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
    });
  });

  it("renders the sign in call to action when there is no authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(await HomePage());

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

  it("hides the sign in call to action when there is an authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "grace.hopper@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });

    render(await HomePage());

    expect(
      screen.queryByRole("link", { name: /iniciar sesion/i })
    ).not.toBeInTheDocument();
  });
});
