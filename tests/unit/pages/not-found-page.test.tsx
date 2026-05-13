import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";

import {
  NotFoundSessionAction,
  NotFoundView,
} from "@/app/not-found-content";
import { createRequestAuthModule } from "@/src/modules/auth/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const errorMock = jest.fn();

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/src/modules/auth/setup", () => ({
  createRequestAuthModule: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
  })
);

async function renderNotFoundPageWithSessionAction() {
  render(<NotFoundView sessionAction={await NotFoundSessionAction()} />);
}

describe("NotFoundPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    errorMock.mockReset();
    (headers as jest.Mock).mockResolvedValue(new Headers());

    (createRequestAuthModule as jest.Mock).mockReturnValue({
      useCases: {
        getAuthenticatedMember,
      },
    });
    (createServerLogger as jest.Mock).mockReturnValue({
      error: errorMock,
      info: jest.fn(),
    });
  });

  it("renders the sign in action when there is no authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    await renderNotFoundPageWithSessionAction();

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
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });

    await renderNotFoundPageWithSessionAction();

    expect(
      screen.getByRole("link", { name: /volver al inicio/i })
    ).toHaveAttribute("href", "/");
    expect(
      screen.queryByRole("link", { name: /iniciar sesion/i })
    ).not.toBeInTheDocument();
  });

  it("falls back safely when the session lookup fails", async () => {
    getAuthenticatedMember.mockRejectedValue(new Error("session_lookup_failed"));

    await renderNotFoundPageWithSessionAction();

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

  it("falls back safely when auth module setup fails", async () => {
    (createRequestAuthModule as jest.Mock).mockImplementation(() => {
      throw new Error("module_setup_failed");
    });

    await renderNotFoundPageWithSessionAction();

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

  it("falls back safely when async auth module setup fails", async () => {
    (createRequestAuthModule as jest.Mock).mockImplementation(() => ({
      useCases: {
        getAuthenticatedMember: jest.fn().mockRejectedValue(
          new Error("module_setup_failed")
        ),
      },
    }));

    await renderNotFoundPageWithSessionAction();

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
