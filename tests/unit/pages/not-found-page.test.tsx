import { render, screen } from "@testing-library/react";

import NotFoundPage from "@/app/not-found";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";

const getAuthenticatedMember = jest.fn();

jest.mock(
  "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case",
  () => ({
    createGetAuthenticatedMemberUseCase: jest.fn(),
  })
);

describe("NotFoundPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();

    (createGetAuthenticatedMemberUseCase as jest.Mock).mockReturnValue({
      execute: getAuthenticatedMember,
    });
  });

  it("renders the sign in action when there is no authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(await NotFoundPage());

    expect(
      screen.getByRole("heading", {
        name: /esta pagina no existe o ya no esta disponible/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /volver al inicio/i })
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("link", { name: /iniciar sesion/i })
    ).toHaveAttribute("href", "/auth/signin");
  });

  it("hides the sign in action when the user is already authenticated", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });

    render(await NotFoundPage());

    expect(
      screen.getByRole("link", { name: /volver al inicio/i })
    ).toHaveAttribute("href", "/");
    expect(
      screen.queryByRole("link", { name: /iniciar sesion/i })
    ).not.toBeInTheDocument();
  });
});
