import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import CommunityPage from "@/app/(platform)/tribu/[slug]/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getCommunityPageAccess = jest.fn();
const listCommunityFeed = jest.fn();
const infoMock = jest.fn();
const errorMock = jest.fn();

const postCategory = {
  accessScope: "members" as const,
  emoji: "💬",
  id: "category-general",
  name: "General",
  slug: "general",
  sortOrder: 20,
};

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
  useRouter: () => ({
    refresh: jest.fn(),
  }),
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

describe("CommunityPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getCommunityPageAccess.mockReset();
    listCommunityFeed.mockReset();
    infoMock.mockReset();
    errorMock.mockReset();

    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      communities: {
        useCases: {
          getCommunityPageAccess,
        },
      },
      posts: {
        useCases: {
          listCommunityFeed,
        },
      },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      info: infoMock,
      error: errorMock,
    });
  });

  it("renders the community operational home when access is visible", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    getCommunityPageAccess.mockResolvedValue({
      status: "visible",
      community: {
        id: "community-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    listCommunityFeed.mockResolvedValue({
      activeCategoryId: null,
      categories: [postCategory],
      viewerPermissions: {
        canComment: true,
        canCreatePost: true,
        canReact: true,
      },
      posts: [
        {
          id: "post-1",
          author: {
            id: "owner-1",
            name: "Ada Lovelace",
            role: "owner",
            avatarFallback: "AL",
            image: null,
          },
          category: postCategory,
          comments: [
            {
              id: "comment-1",
              author: {
                id: "admin-1",
                name: "Grace Hopper",
                role: "admin",
                avatarFallback: "GH",
                image: null,
              },
              content: "Gracias por la bienvenida",
              createdAt: "2026-04-26T12:05:00.000Z",
            },
          ],
          content: "Bienvenida a la tribu",
          createdAt: "2026-04-26T12:00:00.000Z",
          likedByViewer: false,
          likeCount: 2,
          title: "Anuncio inicial",
        },
        {
          id: "post-2",
          author: {
            id: "member-2",
            name: "Katherine Johnson",
            role: "member",
            avatarFallback: "KJ",
            image: null,
          },
          category: postCategory,
          comments: [],
          content: "Comparto un recurso nuevo",
          createdAt: "2026-04-26T11:00:00.000Z",
          likedByViewer: true,
          likeCount: 1,
          title: "Nuevo recurso",
        },
      ],
    });

    render(
      await CommunityPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(screen.queryByText("Inicio de tribu")).not.toBeInTheDocument();
    expect(screen.queryByText("Matematica Pro")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Compartí novedades, preguntas y recursos con los miembros.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Tribu privada")).not.toBeInTheDocument();
    expect(screen.queryByText("/tribu/matematica-pro")).not.toBeInTheDocument();
    expect(screen.queryByText("Publicaciones")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Escribí algo",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", {
        name: "Escribir un comentario",
      })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Bienvenida a la tribu")).toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();
    expect(screen.queryByText("Gracias por la bienvenida")).not.toBeInTheDocument();
    expect(screen.getByText("Propietario")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Miembro")).not.toBeInTheDocument();
    expect(screen.queryByText("Estado de la tribu")).not.toBeInTheDocument();
  });

  it("renders a read-only empty feed for muted members", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "muted@example.com",
      name: "Muted User",
      role: "member",
      avatarFallback: "MU",
      image: null,
    });
    getCommunityPageAccess.mockResolvedValue({
      status: "visible",
      community: {
        id: "community-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    listCommunityFeed.mockResolvedValue({
      activeCategoryId: null,
      categories: [postCategory],
      viewerPermissions: {
        canComment: false,
        canCreatePost: false,
        canReact: false,
      },
      posts: [],
    });

    render(
      await CommunityPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(
      screen.queryByRole("button", {
        name: "Escribí algo",
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Podes leer el feed, pero tu estado actual no permite participar.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("El feed esta listo para la primera publicacion")
    ).toBeInTheDocument();
  });

  it("returns 404 and logs unauthenticated hidden access", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getCommunityPageAccess.mockResolvedValue({
      status: "hidden",
      reason: "unauthenticated_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      CommunityPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(infoMock).toHaveBeenCalledWith({
      message: "Community access hidden",
      metadata: expect.objectContaining({
        reason: "unauthenticated_hidden",
        slug: "matematica-pro",
        viewerId: null,
      }),
    });
  });

  it("returns 404 and logs blocked hidden access", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "blocked@example.com",
      name: "Blocked User",
      role: "member",
      avatarFallback: "BU",
      image: null,
    });
    getCommunityPageAccess.mockResolvedValue({
      status: "hidden",
      reason: "blocked_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      CommunityPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(infoMock).toHaveBeenCalledWith({
      message: "Community access hidden",
      metadata: expect.objectContaining({
        reason: "blocked_hidden",
        slug: "matematica-pro",
        viewerId: "member-1",
      }),
    });
  });

  it("returns 404 and logs generic hidden access when the slug is not visible", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    getCommunityPageAccess.mockResolvedValue({
      status: "hidden",
      reason: "not_found_or_not_visible",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      CommunityPage({
        params: Promise.resolve({
          slug: "missing-community",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(infoMock).toHaveBeenCalledWith({
      message: "Community access hidden",
      metadata: expect.objectContaining({
        reason: "not_found_or_not_visible",
        slug: "missing-community",
        viewerId: "member-1",
      }),
    });
  });

  it("returns 404 and logs unexpected repository failures", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    getCommunityPageAccess.mockRejectedValue(new Error("Database exploded"));
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      CommunityPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(errorMock).toHaveBeenCalledWith({
      message: "Failed to resolve community access",
      error: expect.any(Error),
      metadata: expect.objectContaining({
        reason: "unexpected_repository_error",
        slug: "matematica-pro",
        viewerId: "member-1",
      }),
    });
  });
});
