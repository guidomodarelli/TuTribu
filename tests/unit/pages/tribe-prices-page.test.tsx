import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribePricesPage from "@/app/(platform)/[slug]/precios/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const getTribePageAccess = vi.fn();
const getCurrentTribeMembershipStatus = vi.fn();
const getMemberTribes = vi.fn();
const getTribeSubscriberDiagnostics = vi.fn();
const listTribeSubscriptionPrices = vi.fn();
const errorMock = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/components/subscriptions/tribe-subscription-price-management", () => ({
  TribeSubscriptionPriceManagement: ({
    canManagePrices,
    isMercadoPagoConnected,
    prices,
    shouldAutoConnectMercadoPago,
    subscriberDiagnostics,
    statusMessage,
    tribeSlug,
  }: {
    canManagePrices: boolean;
    isMercadoPagoConnected: boolean;
    prices: unknown[];
    shouldAutoConnectMercadoPago?: boolean;
    subscriberDiagnostics?: unknown;
    statusMessage: string | null;
    tribeSlug: string;
  }) => (
    <section>
      <h1>Gestión de precios</h1>
      <p>{tribeSlug}</p>
      <p>{canManagePrices ? "opera" : "lee"}</p>
      <p>{isMercadoPagoConnected ? "conectado" : "desconectado"}</p>
      <p>{shouldAutoConnectMercadoPago ? "auto-conecta" : "no-auto-conecta"}</p>
      {statusMessage ? <p>{statusMessage}</p> : null}
      <p>{subscriberDiagnostics ? "con-diagnostico" : "sin-diagnostico"}</p>
      <p>{prices.length}</p>
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

describe("TribePricesPage", () => {
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
    listTribeSubscriptionPrices.mockResolvedValue({
      prices: [
        {
          activeSubscribersCount: 0,
          amountCents: 500000,
          createdAt: "2026-05-06T12:00:00.000Z",
          currency: "ARS",
          frequency: "monthly",
          id: "price-1",
          isCurrent: true,
          name: "Plan mensual",
          status: "active" as const,
        },
      ],
      hasMercadoPagoIntegration: true,
      mercadoPagoConnectionStatus: "connected",
      viewerPermissions: {
        canManagePrices: true,
        canViewPrices: true,
      },
    });
    getTribeSubscriberDiagnostics.mockResolvedValue({
      localActiveSubscribersCount: 2,
      mercadoPagoAuthorizedSubscribersCount: 2,
      mercadoPagoCanceledOrMissingSubscribersCount: 1,
      mercadoPagoPausedSubscribersCount: 0,
      mercadoPagoPendingSubscribersCount: 3,
    });
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
      subscriptions: {
        useCases: {
          getTribeSubscriberDiagnostics,
          listTribeSubscriptionPrices,
        },
      },
      tribes: {
        useCases: {
          getCurrentTribeMembershipStatus,
          getMemberTribes,
          getTribePageAccess,
        },
      },
    });
  });

  it("renders operational price management for leaders", async () => {
    render(await TribePricesPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de precios" })).toBeInTheDocument();
    expect(screen.getByText("opera")).toBeInTheDocument();
    expect(screen.getByText("conectado")).toBeInTheDocument();
    expect(screen.getByText("auto-conecta")).toBeInTheDocument();
    expect(screen.getByText("con-diagnostico")).toBeInTheDocument();
    expect(getTribeSubscriberDiagnostics).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("renders read-only price management for guardians", async () => {
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listTribeSubscriptionPrices.mockResolvedValue({
      prices: [],
      hasMercadoPagoIntegration: false,
      mercadoPagoConnectionStatus: "requires_reconnection",
      viewerPermissions: {
        canManagePrices: false,
        canViewPrices: true,
      },
    });

    render(await TribePricesPage(buildPageProps()));

    expect(screen.getByText("lee")).toBeInTheDocument();
    expect(screen.getByText("sin-diagnostico")).toBeInTheDocument();
    expect(getTribeSubscriberDiagnostics).not.toHaveBeenCalled();
  });

  it("does not start Mercado Pago auto connection when price loading fails", async () => {
    listTribeSubscriptionPrices.mockRejectedValue(new Error("database timeout"));

    render(await TribePricesPage(buildPageProps()));

    expect(screen.getByText("desconectado")).toBeInTheDocument();
    expect(screen.getByText("no-auto-conecta")).toBeInTheDocument();
    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Failed to resolve tribe subscription prices",
      })
    );
  });

  it("does not render stale setup status when Mercado Pago is connected", async () => {
    render(
      await TribePricesPage({
        ...buildPageProps(),
        searchParams: Promise.resolve({
          status: "setup_required" as const,
        }),
      })
    );

    expect(
      screen.queryByText(
        "Falta configurar la aplicación OAuth de Mercado Pago en el entorno."
      )
    ).not.toBeInTheDocument();
    expect(screen.getByText("conectado")).toBeInTheDocument();
  });

  it("renders fresh OAuth setup status when Mercado Pago is connected", async () => {
    render(
      await TribePricesPage({
        ...buildPageProps(),
        searchParams: Promise.resolve({
          status: "setup_required" as const,
          statusOrigin: "mercado_pago_oauth",
        }),
      })
    );

    expect(
      screen.getByText(
        "Falta configurar la aplicación OAuth de Mercado Pago en el entorno."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("conectado")).toBeInTheDocument();
  });

  it("does not render stale connected status when Mercado Pago requires reconnection", async () => {
    listTribeSubscriptionPrices.mockResolvedValue({
      prices: [],
      hasMercadoPagoIntegration: false,
      mercadoPagoConnectionStatus: "requires_reconnection",
      viewerPermissions: {
        canManagePrices: true,
        canViewPrices: true,
      },
    });
    render(
      await TribePricesPage({
        ...buildPageProps(),
        searchParams: Promise.resolve({
          status: "connected" as const,
        }),
      })
    );

    expect(
      screen.queryByText("Mercado Pago quedó conectado.")
    ).not.toBeInTheDocument();
    expect(screen.getByText("desconectado")).toBeInTheDocument();
  });

  it("returns 404 when a regular member opens price management", async () => {
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

    await expect(TribePricesPage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(listTribeSubscriptionPrices).not.toHaveBeenCalled();
  });
});
