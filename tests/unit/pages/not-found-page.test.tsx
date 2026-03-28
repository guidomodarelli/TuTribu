import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";

import NotFoundPage from "@/app/not-found";
import { createAuthModule } from "@/src/modules/auth/setup";

const getAuthenticatedMember = jest.fn();

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/src/modules/auth/setup", () => ({
  createAuthModule: jest.fn(),
}));

describe("NotFoundPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    (headers as jest.Mock).mockResolvedValue(new Headers());

    (createAuthModule as jest.Mock).mockReturnValue({
      useCases: {
        getAuthenticatedMember,
      },
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

  it("falls back safely when the session lookup fails", async () => {
    getAuthenticatedMember.mockRejectedValue(new Error("session_lookup_failed"));

    render(await NotFoundPage());

    expect(
      screen.getByRole("heading", {
        name: /esta pagina no existe o ya no esta disponible/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /iniciar sesion/i })
    ).toHaveAttribute("href", "/auth/signin");
  });
});
