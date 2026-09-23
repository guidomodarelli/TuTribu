import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderServerComponent } from "@/tests/render-server-component";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeEventsPage from "@/app/(platform)/[slug]/eventos/page";
import TribeMeritsPage from "@/app/(platform)/[slug]/meritos/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const getTribePageAccess = vi.fn();
const listTribeEvents = vi.fn();
const getTribeEventAttendanceStreak = vi.fn();
const infoMock = vi.fn();
const errorMock = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(),
  })
);

const visibleTribeAccess = {
  status: "visible" as const,
  tribe: {
    id: "tribe-1",
    name: "Matematica Pro",
    slug: "matematica-pro",
    visibility: "private",
  },
};

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

const openClassOccurrence = {
  attendance: {
    goingCount: 0,
    goingPreview: [],
    maybeCount: 0,
    viewerStatus: null,
    viewerWaitlistPosition: null,
    waitlistedCount: 0,
  },
  capacity: null,
  description: "Repaso mensual",
  endsAt: "2026-05-06T19:00:00.000Z",
  eventId: EVENT_ID,
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  occurrenceKey: `${EVENT_ID}@2026-05-06T18:00:00.000Z`,
  recurrenceFrequency: "none",
  recurrenceRule: null,
  recurrenceUntil: null,
  seriesEndsAt: "2026-05-06T19:00:00.000Z",
  seriesStartsAt: "2026-05-06T18:00:00.000Z",
  startsAt: "2026-05-06T18:00:00.000Z",
  title: "Clase abierta",
};

const mayListing = {
  events: [openClassOccurrence],
  month: {
    current: "2026-05",
    next: "2026-06",
    previous: "2026-04",
  },
  selectedOccurrenceKey: null,
  viewerPermissions: {
    canManageEvents: true,
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
    vi.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getTribePageAccess.mockReset();
    listTribeEvents.mockReset();
    getTribeEventAttendanceStreak.mockReset();
    getTribeEventAttendanceStreak.mockResolvedValue(null);
    infoMock.mockReset();
    errorMock.mockReset();

    (createRequestModules as Mock).mockResolvedValue({
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
          getTribeEventAttendanceStreak,
          listTribeEvents,
        },
      },
    });
    (headers as Mock).mockResolvedValue(new Headers());
    (createServerLogger as Mock).mockReturnValue({
      info: infoMock,
      error: errorMock,
    });
  });

  it("renders the event calendar page when tribe access is visible", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    listTribeEvents.mockResolvedValue(mayListing);

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
      occurrence: null,
      tribeSlug: "matematica-pro",
    });
  });

  it("ignores malformed month and deep-link values instead of failing", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    listTribeEvents.mockResolvedValue(mayListing);

    render(
      await TribeEventsPage({
        params: Promise.resolve({ slug: "matematica-pro" }),
        searchParams: Promise.resolve({
          event: "not-a-uuid@2026-05-06T18:00:00.000Z",
          month: ["2026-13", "2026-05"],
        }),
      })
    );

    expect(listTribeEvents).toHaveBeenCalledWith({
      month: null,
      occurrence: null,
      tribeSlug: "matematica-pro",
    });
    expect(screen.getByRole("heading", { name: "Mayo 2026", level: 1 })).toBeInTheDocument();
  });

  it("returns 404 for a malformed tribe slug without touching the modules", async () => {
    (notFound as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribeEventsPage({ params: Promise.resolve({ slug: "Mate Pro" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(createRequestModules).not.toHaveBeenCalled();
    expect(listTribeEvents).not.toHaveBeenCalled();
  });

  it("shows the safe fallback when the listing is not a usable public DTO", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    listTribeEvents.mockResolvedValue({
      ...mayListing,
      events: [{ ...openClassOccurrence, startsAt: "raw-db-value" }],
    });

    render(
      await TribeEventsPage({
        params: Promise.resolve({ slug: "matematica-pro" }),
        searchParams: Promise.resolve({ month: "2026-05" }),
      })
    );

    expect(
      screen.getByText("No pudimos cargar los eventos. Intentá de nuevo en unos minutos.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Clase abierta")).not.toBeInTheDocument();
    expect(errorMock).toHaveBeenCalledWith({
      message: "Tribe event public DTO rejected",
      metadata: expect.objectContaining({
        issues: [expect.objectContaining({ path: "events.0.startsAt" })],
        reason: "public_dto_rejected",
        slug: "matematica-pro",
      }),
    });
    expect(JSON.stringify(errorMock.mock.calls)).not.toContain("raw-db-value");
  });

  it("omits an unusable streak but still renders the calendar", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    listTribeEvents.mockResolvedValue(mayListing);
    getTribeEventAttendanceStreak.mockResolvedValue({ attendedCount: "4", occurrenceCount: 5 });

    render(
      await TribeEventsPage({
        params: Promise.resolve({ slug: "matematica-pro" }),
        searchParams: Promise.resolve({ month: "2026-05" }),
      })
    );

    expect(screen.getByRole("heading", { name: "Mayo 2026", level: 1 })).toBeInTheDocument();
    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Tribe event public DTO rejected" })
    );
  });

  it("forwards the deep-linked occurrence so the listing can resolve its month", async () => {
    const occurrenceKey = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f@2026-06-10T18:00:00.000Z";
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    listTribeEvents.mockResolvedValue({
      events: [],
      month: { current: "2026-06", next: "2026-07", previous: "2026-05" },
      selectedOccurrenceKey: null,
      viewerPermissions: { canManageEvents: false },
    });

    render(
      await TribeEventsPage({
        params: Promise.resolve({ slug: "matematica-pro" }),
        searchParams: Promise.resolve({ event: occurrenceKey }),
      })
    );

    expect(listTribeEvents).toHaveBeenCalledWith({
      month: null,
      occurrence: {
        eventId: "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f",
        key: occurrenceKey,
        occurrenceStartsAt: "2026-06-10T18:00:00.000Z",
      },
      tribeSlug: "matematica-pro",
    });
    expect(screen.getByRole("heading", { name: "Junio 2026", level: 1 })).toBeInTheDocument();
  });

  it("still renders the calendar when the attendance streak cannot be computed", async () => {
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    listTribeEvents.mockResolvedValue({
      events: [],
      month: { current: "2026-06", next: "2026-07", previous: "2026-05" },
      selectedOccurrenceKey: null,
      viewerPermissions: { canManageEvents: false },
    });
    getTribeEventAttendanceStreak.mockRejectedValue(new Error("connection reset"));

    render(
      await TribeEventsPage({
        params: Promise.resolve({ slug: "matematica-pro" }),
        searchParams: Promise.resolve({ month: "2026-06" }),
      })
    );

    expect(screen.getByRole("heading", { name: "Junio 2026", level: 1 })).toBeInTheDocument();
    expect(getTribeEventAttendanceStreak).toHaveBeenCalledWith({ tribeSlug: "matematica-pro" });
    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Failed to compute tribe event attendance streak",
        metadata: expect.objectContaining({ slug: "matematica-pro" }),
      })
    );
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
      <TribeMeritsPage {...pageProps} key="merits" />,
    ];

    for (const renderedPage of await Promise.all(pages)) {
      const { unmount } = await renderServerComponent(renderedPage);

      expect(screen.getByText("Próximamente")).toBeInTheDocument();
      expect(screen.getByText("Esta sección está en construcción.")).toBeInTheDocument();

      unmount();
    }
  });

  it("returns 404 when the viewer is not authenticated", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getTribePageAccess.mockResolvedValue({
      status: "hidden" as const,
      reason: "unauthenticated_hidden",
    });
    (notFound as unknown as Mock).mockImplementation(function () {
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
      status: "hidden" as const,
      reason: "blocked_hidden",
    });
    (notFound as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      renderServerComponent(<TribeMeritsPage params={Promise.resolve({ slug: "matematica-pro" })} />)
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
