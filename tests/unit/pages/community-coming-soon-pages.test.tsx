import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import CommunityAboutPage from "@/app/(platform)/comunidad/[slug]/acerca-de/page";
import CommunityEventsPage from "@/app/(platform)/comunidad/[slug]/eventos/page";
import CommunityMembersPage from "@/app/(platform)/comunidad/[slug]/miembros/page";
import CommunityRankingPage from "@/app/(platform)/comunidad/[slug]/ranking/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getCommunityPageAccess = jest.fn();
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

const visibleCommunityAccess = {
  status: "visible",
  community: {
    id: "community-1",
    name: "Matematica Pro",
    slug: "matematica-pro",
    visibility: "private",
  },
};

const authenticatedMember = {
  id: "member-1",
  email: "owner@example.com",
  name: "Grace Hopper",
  role: "member",
  avatarFallback: "GH",
  image: null,
};

describe("community coming soon pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getCommunityPageAccess.mockReset();
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
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      info: infoMock,
      error: errorMock,
    });
  });

  it("renders the shared coming soon state for future community sections", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getCommunityPageAccess.mockResolvedValue(visibleCommunityAccess);

    render(
      await CommunityEventsPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(
      screen.getByRole("heading", {
        name: "Eventos",
        level: 1,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Próximamente")).toBeInTheDocument();
    expect(screen.getByText("Esta sección está en construcción.")).toBeInTheDocument();
  });

  it("uses the same shared state across all planned community sections", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getCommunityPageAccess.mockResolvedValue(visibleCommunityAccess);

    const pageProps = {
      params: Promise.resolve({
        slug: "matematica-pro",
      }),
    };

    const pages = [
      CommunityMembersPage(pageProps),
      CommunityRankingPage(pageProps),
      CommunityAboutPage(pageProps),
    ];

    for (const renderedPage of await Promise.all(pages)) {
      const { unmount } = render(renderedPage);

      expect(screen.getByText("Próximamente")).toBeInTheDocument();
      expect(screen.getByText("Esta sección está en construcción.")).toBeInTheDocument();

      unmount();
    }
  });

  it("returns 404 when the viewer is not authenticated", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getCommunityPageAccess.mockResolvedValue({
      status: "hidden",
      reason: "unauthenticated_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      CommunityEventsPage({
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

  it("returns 404 when community access is hidden", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getCommunityPageAccess.mockResolvedValue({
      status: "hidden",
      reason: "blocked_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      CommunityMembersPage({
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
});
