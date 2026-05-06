import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeAboutPage from "@/app/(platform)/tribu/[slug]/acerca-de/page";
import TribeEventsPage from "@/app/(platform)/tribu/[slug]/eventos/page";
import TribeMembersPage from "@/app/(platform)/tribu/[slug]/miembros/page";
import TribeRankingPage from "@/app/(platform)/tribu/[slug]/ranking/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
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

const visibleTribeAccess = {
  status: "visible",
  tribe: {
    id: "tribe-1",
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

describe("tribe coming soon pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getTribePageAccess.mockReset();
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
        },
      },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      info: infoMock,
      error: errorMock,
    });
  });

  it("renders the shared coming soon state for future tribe sections", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);

    render(
      await TribeEventsPage({
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

  it("uses the same shared state across all planned tribe sections", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);

    const pageProps = {
      params: Promise.resolve({
        slug: "matematica-pro",
      }),
    };

    const pages = [
      TribeMembersPage(pageProps),
      TribeRankingPage(pageProps),
      TribeAboutPage(pageProps),
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
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      reason: "unauthenticated_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribeEventsPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(infoMock).toHaveBeenCalledWith({
      message: "Tribe access hidden",
      metadata: expect.objectContaining({
        reason: "unauthenticated_hidden",
        slug: "matematica-pro",
        viewerId: null,
      }),
    });
  });

  it("returns 404 when tribe access is hidden", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue({
      status: "hidden",
      reason: "blocked_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribeMembersPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(infoMock).toHaveBeenCalledWith({
      message: "Tribe access hidden",
      metadata: expect.objectContaining({
        reason: "blocked_hidden",
        slug: "matematica-pro",
        viewerId: "member-1",
      }),
    });
  });
});
