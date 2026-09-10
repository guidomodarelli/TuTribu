import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeInvitationMetricsPage from "@/app/(platform)/[slug]/invitaciones/metricas/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const getTribePageAccess = vi.fn();
const getCurrentTribeMembershipStatus = vi.fn();
const getMemberTribes = vi.fn();
const getTribeInvitationConversionMetrics = vi.fn();
const errorMock = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
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

describe("TribeInvitationMetricsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    getTribeInvitationConversionMetrics.mockResolvedValue([
      {
        campaignName: "Lanzamiento mayo",
        channel: "instagram",
        clicks: null,
        invitationId: "invitation-1",
        mercadoPagoAccountEmail: "partner@example.com",
        mercadoPagoAccountLabel: "Partner MP",
        paidActive: 2,
        paymentIntegrationId: "payment-1",
        referrerHandle: "@partner",
        revenueCents: 10000,
        signups: 3,
      },
    ]);
    (headers as Mock).mockResolvedValue(new Headers());
    (createServerLogger as Mock).mockReturnValue({
      error: errorMock,
      info: vi.fn(),
    });
    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          getCurrentTribeMembershipStatus,
          getMemberTribes,
          getTribeInvitationConversionMetrics,
          getTribePageAccess,
        },
      },
    });
  });

  it("renders conversion metrics for tribe leaders", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(function () { return undefined; });
    getTribeInvitationConversionMetrics.mockResolvedValue([
      {
        campaignName: "Lanzamiento mayo",
        channel: "instagram",
        clicks: null,
        invitationId: "invitation-1",
        mercadoPagoAccountEmail: "partner@example.com",
        mercadoPagoAccountLabel: "Partner MP",
        paidActive: 2,
        paymentIntegrationId: "payment-1",
        referrerHandle: "@partner",
        revenueCents: 10000,
        signups: 3,
      },
      {
        campaignName: "Lanzamiento mayo",
        channel: "instagram",
        clicks: null,
        invitationId: "invitation-1",
        mercadoPagoAccountEmail: "other@example.com",
        mercadoPagoAccountLabel: "Other MP",
        paidActive: 1,
        paymentIntegrationId: "payment-2",
        referrerHandle: "@partner",
        revenueCents: 5000,
        signups: 1,
      },
    ]);

    render(await TribeInvitationMetricsPage(buildPageProps()));

    expect(
      screen.getByRole("heading", { name: "Métricas de invitaciones" })
    ).toBeInTheDocument();
    expect(getTribeInvitationConversionMetrics).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
    expect(screen.getAllByRole("cell", { name: "Instagram" })).toHaveLength(2);
    expect(
      screen.getAllByRole("cell", { name: "Lanzamiento mayo" })
    ).toHaveLength(2);
    expect(screen.getAllByRole("cell", { name: "@partner" })).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "3" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /100/ })).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "Partner MP (partner@example.com)" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "Other MP (other@example.com)" })
    ).toBeInTheDocument();
    expect(
      consoleErrorSpy.mock.calls.some(([message]) =>
        String(message).includes("Encountered two children with the same key")
      )
    ).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it("renders conversion metrics for tribe guardians", async () => {
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);

    render(await TribeInvitationMetricsPage(buildPageProps()));

    expect(
      screen.getByRole("heading", { name: "Métricas de invitaciones" })
    ).toBeInTheDocument();
  });

  it("shows the empty state when no conversions are attributed", async () => {
    getTribeInvitationConversionMetrics.mockResolvedValue([]);

    render(await TribeInvitationMetricsPage(buildPageProps()));

    expect(
      screen.getByText(
        "Todavía no hay conversiones atribuidas a links activos."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Inscripciones" })
    ).not.toBeInTheDocument();
  });

  it("returns 404 when a regular member opens invitation metrics", async () => {
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    (notFound as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeInvitationMetricsPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );

    expect(notFound).toHaveBeenCalled();
    expect(getTribeInvitationConversionMetrics).not.toHaveBeenCalled();
  });
});
