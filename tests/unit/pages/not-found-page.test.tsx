import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";

import NotFoundPage from "@/app/not-found";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const errorMock = jest.fn();

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
  })
);

describe("NotFoundPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    errorMock.mockReset();
    (headers as jest.Mock).mockResolvedValue(new Headers());

    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      communities: {
        useCases: {},
      },
    });
    (createServerLogger as jest.Mock).mockReturnValue({
      error: errorMock,
      info: jest.fn(),
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
    expect(errorMock).toHaveBeenCalledWith({
      message: "Failed to resolve session for not found page",
      error: expect.any(Error),
    });
  });

  it("falls back safely when module setup fails", async () => {
    (createRequestModules as jest.Mock).mockRejectedValue(
      new Error("module_setup_failed")
    );

    render(await NotFoundPage());

    expect(
      screen.getByRole("heading", {
        name: /esta pagina no existe o ya no esta disponible/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /iniciar sesion/i })
    ).toHaveAttribute("href", "/auth/signin");
    expect(errorMock).toHaveBeenCalledWith({
      message: "Failed to resolve session for not found page",
      error: expect.any(Error),
    });
  });
});
