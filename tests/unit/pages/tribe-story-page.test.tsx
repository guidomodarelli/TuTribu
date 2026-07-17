import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeHistoryPage from "@/app/(platform)/[slug]/historia/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getCurrentTribeMembershipStatus = jest.fn();
const getMemberTribes = jest.fn();
const getTribeStory = jest.fn();
const getTribeStoryStats = jest.fn();
const getTribeCurrentSubscriptionOffer = jest.fn();

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
    jest.clearAllMocks();
    (createRequestModules as jest.Mock).mockResolvedValue({
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
          getTribeStoryStats,
        },
      },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
    });
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    getTribeStory.mockResolvedValue({
      content: "Nacimos en 2020.",
      coverUrl: null,
      logoUrl: null,
      media: [],
      websiteUrl: null,
    });
    getTribeStoryStats.mockResolvedValue(storyStats);
    getTribeCurrentSubscriptionOffer.mockResolvedValue({
      status: "unavailable",
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
      {
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
      status: "hidden",
    });
    getTribeCurrentSubscriptionOffer.mockResolvedValue({
      price: {
        amountCents: 1500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available",
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
      status: "hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeHistoryPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("renders the visitor view with a free join button when free open join is available", async () => {
    getTribePageAccess.mockResolvedValue({
      reason: "not_found_or_not_visible",
      status: "hidden",
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

  it("renders the visitor view for an anonymous viewer linking the join to sign in", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getTribePageAccess.mockResolvedValue({
      reason: "unauthenticated_hidden",
      status: "hidden",
    });
    getTribeCurrentSubscriptionOffer.mockResolvedValue({
      price: {
        amountCents: 1500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available",
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
      status: "hidden",
    });
    getTribeCurrentSubscriptionOffer.mockResolvedValue({
      price: {
        amountCents: 1500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeHistoryPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(getTribeCurrentSubscriptionOffer).not.toHaveBeenCalled();
  });

  it("returns 404 when the viewer has a pending non-member status", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue(null);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeHistoryPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(getTribeStory).not.toHaveBeenCalled();
  });
});
