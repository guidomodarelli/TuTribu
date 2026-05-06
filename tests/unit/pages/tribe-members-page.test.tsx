import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeTribePage from "@/app/(platform)/tribu/[slug]/tribu/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const listVisibleTribeMembers = jest.fn();
const infoMock = jest.fn();
const errorMock = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

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

describe("TribeTribePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getTribePageAccess.mockReset();
    listVisibleTribeMembers.mockReset();
    infoMock.mockReset();
    errorMock.mockReset();

    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          getTribePageAccess,
          listVisibleTribeMembers,
        },
      },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      info: infoMock,
      error: errorMock,
    });
  });

  it("renders the visible tribe members with leader and guardian role pills", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    listVisibleTribeMembers.mockResolvedValue([
      {
        avatarFallback: "AL",
        id: "member-2",
        image: null,
        name: "Ada Lovelace",
        role: "leader",
      },
      {
        avatarFallback: "GH",
        id: "member-1",
        image: null,
        name: "Grace Hopper",
        role: "guardian",
      },
      {
        avatarFallback: "KJ",
        id: "member-3",
        image: null,
        name: "Katherine Johnson",
        role: "tribemate",
      },
    ]);

    render(
      await TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Miembros",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Katherine Johnson")).toBeInTheDocument();
    expect(screen.getByText("Líder")).toBeInTheDocument();
    expect(screen.getByText("Guardián")).toBeInTheDocument();
    expect(screen.queryByText("Integrante")).not.toBeInTheDocument();
    expect(listVisibleTribeMembers).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("returns 404 when visible member loading fails", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    listVisibleTribeMembers.mockRejectedValue(new Error("Database exploded"));
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(errorMock).toHaveBeenCalledWith({
      error: expect.any(Error),
      message: "Failed to resolve tribe members",
      metadata: expect.objectContaining({
        reason: "unexpected_members_repository_error",
        slug: "matematica-pro",
        viewerId: "member-1",
      }),
    });
  });
});
