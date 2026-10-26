import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeHistoryPage from "@/app/(platform)/[slug]/historia/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const getTribePageAccess = vi.fn();
const getCurrentTribeMembershipStatus = vi.fn();
const getMemberTribes = vi.fn();
const getTribeStory = vi.fn();
const getTribeStoryStats = vi.fn();
const getTribeStoryOnlineMembers = vi.fn();
const getTribeCurrentSubscriptionOffer = vi.fn();
const joinTribeFree = vi.fn();

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
  "@/src/modules/tribes/infrastructure/cache/tribe-story-about-cache",
  () => ({
    getCachedPublicTribeStoryAbout: vi.fn(async (tribeSlug: string) => ({
      stats: await getTribeStoryStats({ tribeSlug }),
      story: await getTribeStory({ tribeSlug }),
    })),
  })
);

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

const authenticatedMember = {
  avatarFallback: "GH",
  email: "leader@example.com",
  id: "member-1",
  image: null,
  name: "Grace Hopper",
  role: "tribemate",
};

const storyStats = {
  adminCount: 2,
  createdAt: "2026-01-10T00:00:00.000Z",
  coverUrl: null,
  logoUrl: null,
  memberCount: 128,
  name: "Matematica Pro",
  onlineCount: 7,
  openFreeJoinAvailable: false,
  openFreeJoinEnabled: false,
};

function buildPageProps() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("TribeHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      subscriptions: {
        useCases: {
          getTribeCurrentSubscriptionOffer,
        },
      },
      tribes: {
        useCases: {
          getCurrentTribeMembershipStatus,
          getMemberTribes,
          getTribePageAccess,
          getTribeStory,
          getTribeStoryOnlineMembers,
          getTribeStoryStats,
          joinTribeFree,
        },
      },
    });
    (headers as Mock).mockResolvedValue(new Headers());
    (createServerLogger as Mock).mockReturnValue({
      error: vi.fn(),
      info: vi.fn(),
    });
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    getTribeStory.mockResolvedValue({
      content: "Nacimos en 2020.",
      media: [],
      websiteUrl: null,
    });
    getTribeStoryStats.mockResolvedValue(storyStats);
    getTribeStoryOnlineMembers.mockResolvedValue([
      { image: null, name: "Grace Hopper" },
    ]);
    getTribeCurrentSubscriptionOffer.mockResolvedValue({
      status: "unavailable" as const,
    });
  });

  it("renders the read-only about view for tribemates", async () => {
    render(await TribeHistoryPage(buildPageProps()));

    expect(
      screen.getByRole("heading", { name: "Historia" })
    ).toBeInTheDocument();
    expect(screen.getByText("Nacimos en 2020.")).toBeInTheDocument();
    expect(screen.getByText("Miembros")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Guardar" })
    ).not.toBeInTheDocument();
    expect(getTribeStory).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("renders the editor for the active leader", async () => {
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);

    render(await TribeHistoryPage(buildPageProps()));

    expect(
      screen.getByLabelText("Historia de la tribu")
    ).toHaveValue("Nacimos en 2020.");
    expect(
      screen.getByRole("button", { name: "Guardar" })
    ).toBeInTheDocument();
  });

  it("renders the visitor about view with a join call to action when the tribe has an open-join offer", async () => {
    getTribePageAccess.mockResolvedValue({
      reason: "not_found_or_not_visible",
      status: "hidden" as const,
    });
    getTribeCurrentSubscriptionOffer.mockResolvedValue({
      price: {
        amountCents: 1500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available" as const,
    });

    render(await TribeHistoryPage(buildPageProps()));

    expect(
      screen.getByRole("heading", { name: "Historia" })
    ).toBeInTheDocument();
    expect(screen.getByText("Nacimos en 2020.")).toBeInTheDocument();
    expect(screen.getByText("Precio")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Unirse a la tribu" })
    ).toHaveAttribute("href", "/matematica-pro");
  });

  it("returns 404 for a non-member when the tribe has no open-join offer", async () => {
    getTribePageAccess.mockResolvedValue({
      reason: "not_found_or_not_visible",
      status: "hidden" as const,
    });
    (notFound as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeHistoryPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("renders the visitor view with a free join button when free open join is available", async () => {
    getTribePageAccess.mockResolvedValue({
      reason: "not_found_or_not_visible",
      status: "hidden" as const,
    });
    getTribeStoryStats.mockResolvedValue({
      ...storyStats,
      openFreeJoinAvailable: true,
      openFreeJoinEnabled: true,
    });

    render(await TribeHistoryPage(buildPageProps()));

    expect(
      screen.getByRole("button", { name: "Unirse gratis" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Unirse a la tribu" })
    ).not.toBeInTheDocument();
  });

  it("tells the visitor why the free join was rejected instead of reloading the story in silence", async () => {
    const user = userEvent.setup();
    getTribePageAccess.mockResolvedValue({
      reason: "not_found_or_not_visible",
      status: "hidden" as const,
    });
    getTribeStoryStats.mockResolvedValue({
      ...storyStats,
      openFreeJoinAvailable: true,
      openFreeJoinEnabled: true,
    });
    joinTribeFree.mockResolvedValue({ status: "forbidden" });

    render(await TribeHistoryPage(buildPageProps()));
    await user.click(screen.getByRole("button", { name: "Unirse gratis" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El ingreso gratis a esta tribu ya no está disponible para tu cuenta. Recargá la página para ver las opciones vigentes o escribile a quien administra la tribu."
    );
    expect(joinTribeFree).toHaveBeenCalledWith({ tribeSlug: "matematica-pro" });
  });

  it("logs a failed free join, explains it and clears the reason while the visitor retries", async () => {
    const user = userEvent.setup();
    const logError = vi.fn();
    (createServerLogger as Mock).mockReturnValue({ error: logError, info: vi.fn() });
    getTribePageAccess.mockResolvedValue({
      reason: "not_found_or_not_visible",
      status: "hidden" as const,
    });
    getTribeStoryStats.mockResolvedValue({
      ...storyStats,
      openFreeJoinAvailable: true,
      openFreeJoinEnabled: true,
    });
    let resolveRetry: (result: { status: string }) => void = () => {};
    joinTribeFree
      .mockRejectedValueOnce(new Error("synthetic free join failure"))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));

    render(await TribeHistoryPage(buildPageProps()));
    await user.click(screen.getByRole("button", { name: "Unirse gratis" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos sumarte a la tribu por un problema temporal. Intentá de nuevo en unos segundos."
    );
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Failed to join tribe for free from its story",
        metadata: { slug: "matematica-pro", viewerId: "member-1" },
      })
    );

    await user.click(screen.getByRole("button", { name: "Unirse gratis" }));

    expect(await screen.findByRole("button", { name: "Uniéndote..." })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    resolveRetry({ status: "forbidden" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El ingreso gratis a esta tribu ya no está disponible para tu cuenta."
    );
  });

  it("renders the visitor view for an anonymous viewer linking the join to sign in", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getTribePageAccess.mockResolvedValue({
      reason: "unauthenticated_hidden",
      status: "hidden" as const,
    });
    getTribeCurrentSubscriptionOffer.mockResolvedValue({
      price: {
        amountCents: 1500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available" as const,
    });

    render(await TribeHistoryPage(buildPageProps()));

    expect(
      screen.getByRole("link", { name: "Unirse a la tribu" })
    ).toHaveAttribute(
      "href",
      "/auth/signin?callbackUrl=%2Fmatematica-pro%2Fhistoria"
    );
  });

  it("returns 404 for conduct-blocked viewers even with an offer", async () => {
    getTribePageAccess.mockResolvedValue({
      blockedReason: "conduct_blocked",
      reason: "blocked_hidden",
      status: "hidden" as const,
    });
    getTribeCurrentSubscriptionOffer.mockResolvedValue({
      price: {
        amountCents: 1500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available" as const,
    });
    (notFound as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeHistoryPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(getTribeCurrentSubscriptionOffer).not.toHaveBeenCalled();
  });

  it("returns 404 when the viewer has a pending non-member status", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue(null);
    (notFound as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeHistoryPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(getTribeStory).not.toHaveBeenCalled();
  });
});
