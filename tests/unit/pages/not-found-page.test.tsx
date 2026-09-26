import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { screen } from "@testing-library/react";
import { renderServerComponent } from "@/tests/render-server-component";
import { headers } from "next/headers";

import {
  NotFoundSessionAction,
  NotFoundView,
} from "@/app/not-found-content";
import { createRequestAuthModule } from "@/src/modules/auth/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const errorMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/link.js", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    prefetch,
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}));

vi.mock("@/src/modules/auth/setup", () => ({
  createRequestAuthModule: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(),
  })
);

async function renderNotFoundPageWithSessionAction() {
  await renderServerComponent(<AppUIProvider><NotFoundView sessionAction={<NotFoundSessionAction />} /></AppUIProvider>);
}

describe("NotFoundPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockReset();
    errorMock.mockReset();
    (headers as Mock).mockResolvedValue(new Headers());

    (createRequestAuthModule as Mock).mockReturnValue({
      useCases: {
        getAuthenticatedMember,
      },
    });
    (createServerLogger as Mock).mockReturnValue({
      error: errorMock,
      info: vi.fn(),
    });
  });

  it("renders the sign in action when there is no authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    await renderNotFoundPageWithSessionAction();

    expect(
      screen.getByRole("heading", {
        name: /esta página no existe o ya no está disponible/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /volver al inicio/i })
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("link", { name: /volver al inicio/i })
    ).toHaveAttribute("data-prefetch", "false");
    expect(
      screen.getByRole("link", { name: /iniciar sesión/i })
    ).toHaveAttribute("href", "/auth/signin");
    expect(
      screen.getByRole("link", { name: /iniciar sesión/i })
    ).toHaveAttribute("data-prefetch", "false");
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
      screen.queryByRole("link", { name: /iniciar sesión/i })
    ).not.toBeInTheDocument();
  });

  it("falls back safely when the session lookup fails", async () => {
    getAuthenticatedMember.mockRejectedValue(new Error("session_lookup_failed"));

    await renderNotFoundPageWithSessionAction();

    expect(
      screen.getByRole("heading", {
        name: /esta página no existe o ya no está disponible/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /iniciar sesión/i })
    ).toHaveAttribute("href", "/auth/signin");
    expect(errorMock).toHaveBeenCalledWith({
      message: "Failed to resolve session for not found page",
      error: expect.any(Error),
    });
  });

  it("falls back safely when auth module setup fails", async () => {
    (createRequestAuthModule as Mock).mockImplementation(function () {
      throw new Error("module_setup_failed");
    });

    await renderNotFoundPageWithSessionAction();

    expect(
      screen.getByRole("heading", {
        name: /esta página no existe o ya no está disponible/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /iniciar sesión/i })
    ).toHaveAttribute("href", "/auth/signin");
    expect(errorMock).toHaveBeenCalledWith({
      message: "Failed to resolve session for not found page",
      error: expect.any(Error),
    });
  });

  it("falls back safely when async auth module setup fails", async () => {
    (createRequestAuthModule as Mock).mockImplementation(function () { return ({
      useCases: {
        getAuthenticatedMember: vi.fn().mockRejectedValue(
          new Error("module_setup_failed")
        ),
      },
    }); });

    await renderNotFoundPageWithSessionAction();

    expect(
      screen.getByRole("heading", {
        name: /esta página no existe o ya no está disponible/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /iniciar sesión/i })
    ).toHaveAttribute("href", "/auth/signin");
    expect(errorMock).toHaveBeenCalledWith({
      message: "Failed to resolve session for not found page",
      error: expect.any(Error),
    });
  });
});
