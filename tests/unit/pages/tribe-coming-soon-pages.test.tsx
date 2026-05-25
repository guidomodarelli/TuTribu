import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeHistoryPage from "@/app/(platform)/[slug]/historia/page";
import TribeEventsPage from "@/app/(platform)/[slug]/eventos/page";
import TribeMeritsPage from "@/app/(platform)/[slug]/meritos/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const listTribeEvents = jest.fn();
const infoMock = jest.fn();
const errorMock = jest.fn();

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
  email: "leader@example.com",
  name: "Grace Hopper",
  role: "tribemate",
  avatarFallback: "GH",
  image: null,
};

describe("tribe coming soon pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getTribePageAccess.mockReset();
    listTribeEvents.mockReset();
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
      events: {
        useCases: {
          listTribeEvents,
        },
      },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      info: infoMock,
      error: errorMock,
    });
  });

  it("renders the event calendar page when tribe access is visible", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    listTribeEvents.mockResolvedValue({
      events: [
        {
          description: "Repaso mensual",
          endsAt: "2026-05-06T19:00:00.000Z",
          id: "event-1",
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          startsAt: "2026-05-06T18:00:00.000Z",
          title: "Clase abierta",
        },
      ],
      month: {
        current: "2026-05",
        next: "2026-06",
        previous: "2026-04",
      },
      viewerPermissions: {
        canManageEvents: true,
      },
    });

    render(
      await TribeEventsPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
        searchParams: Promise.resolve({
          month: "2026-05",
        }),
      })
    );

    expect(
      screen.getByRole("heading", {
        name: "Mayo 2026",
        level: 1,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Clase abierta")).toBeInTheDocument();
    expect(listTribeEvents).toHaveBeenCalledWith({
      month: "2026-05",
      tribeSlug: "matematica-pro",
    });
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
      TribeMeritsPage(pageProps),
      TribeHistoryPage(pageProps),
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
      TribeHistoryPage({
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
