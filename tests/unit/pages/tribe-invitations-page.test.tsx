import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeInvitationsPage from "@/app/(platform)/[slug]/invitaciones/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const getTribePageAccess = vi.fn();
const getCurrentTribeMembershipStatus = vi.fn();
const getMemberTribes = vi.fn();
const listTribeInvitations = vi.fn();
const listTribeSubscriptionPrices = vi.fn();
const reconcileCurrentTribeMemberSubscription = vi.fn();
const infoMock = vi.fn();
const errorMock = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/components/tribes/tribe-invitation-management", () => ({
  TribeInvitationManagement: ({
    availablePrices,
    canManagePrices,
    invitations,
    tribeSlug,
  }: {
    availablePrices: unknown[];
    canManagePrices: boolean;
    invitations: unknown[];
    tribeSlug: string;
  }) => (
    <section>
      <h1>Gestión de invitaciones</h1>
      <p>{tribeSlug}</p>
      <p>{invitations.length}</p>
      <p>plans:{availablePrices.length}</p>
      <p>canManagePrices:{String(canManagePrices)}</p>
    </section>
  ),
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

const authenticatedMember = {
  avatarFallback: "GH",
  email: "leader@example.com",
  id: "member-1",
  image: null,
  name: "Grace Hopper",
  role: "tribemate",
};

const visibleTribeAccess = {
  status: "visible" as const,
  tribe: {
    id: "tribe-1",
    name: "Matematica Pro",
    slug: "matematica-pro",
    visibility: "private",
  },
};

function buildPageProps() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("TribeInvitationsPage", () => {
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_URL = "https://canonical.tutribu.example.com";
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
      },
    ]);
    listTribeInvitations.mockResolvedValue([
      {
        createdAt: "2026-04-26T07:00:00.000Z",
        createdByName: "Grace Hopper",
        id: "invitation-1",
        invitationUrl: null,
        subscriptionAssociation: { type: "current" },
      },
    ]);
    listTribeSubscriptionPrices.mockResolvedValue({
      freeJoinIsCurrent: true,
      hasMercadoPagoIntegration: false,
      mercadoPagoConnectionStatus: "connected",
      prices: [],
      viewerPermissions: { canManagePrices: true, canViewPrices: true },
    });
    reconcileCurrentTribeMemberSubscription.mockResolvedValue({
      status: "processed" as const,
    });
    (headers as Mock).mockResolvedValue(
      new Headers({
        host: "tutribu.example.com",
        "x-forwarded-proto": "https",
      })
    );
    (createServerLogger as Mock).mockReturnValue({
      error: errorMock,
      info: infoMock,
    });
    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      subscriptions: {
        useCases: {
          listTribeSubscriptionPrices,
          reconcileCurrentTribeMemberSubscription,
        },
      },
      tribes: {
        useCases: {
          getTribePageAccess,
          getCurrentTribeMembershipStatus,
          getMemberTribes,
          listTribeInvitations,
        },
      },
    });
  });

  afterEach(() => {
    if (previousBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
    }
  });

  it("renders invitation management for tribe leaders", async () => {
    render(await TribeInvitationsPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de invitaciones" })).toBeInTheDocument();
    expect(listTribeInvitations).toHaveBeenCalledWith({
      baseUrl: "https://canonical.tutribu.example.com",
      tribeSlug: "matematica-pro",
    });
    expect(screen.getByText("canManagePrices:true")).toBeInTheDocument();
  });

  it("renders invitation management for tribe guardians", async () => {
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
      },
    ]);
    listTribeSubscriptionPrices.mockResolvedValue({
      freeJoinIsCurrent: true,
      hasMercadoPagoIntegration: false,
      mercadoPagoConnectionStatus: "connected",
      prices: [],
      viewerPermissions: { canManagePrices: false, canViewPrices: true },
    });

    render(await TribeInvitationsPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de invitaciones" })).toBeInTheDocument();
    expect(screen.getByText("canManagePrices:false")).toBeInTheDocument();
  });

  it("returns 404 when a regular member opens invitation management", async () => {
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
      },
    ]);
    (notFound as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeInvitationsPage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(listTribeInvitations).not.toHaveBeenCalled();
  });
});
