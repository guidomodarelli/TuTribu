import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { POST as POST_VERIFY_ONE } from "@/app/api/tribes/[slug]/subscriptions/prices/[priceId]/verify-provider-plan/route";
import { POST as POST_VERIFY_SUBSCRIBERS } from "@/app/api/tribes/[slug]/subscriptions/prices/[priceId]/verify-provider-subscribers/route";
import { POST as POST_VERIFY_ALL } from "@/app/api/tribes/[slug]/subscriptions/prices/verify-provider-plans/route";
import { POST as POST_RECONCILE_DIAGNOSTICS } from "@/app/api/tribes/[slug]/subscriptions/subscriber-diagnostics/reconcile/route";
import {
  TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const reconcileTribeSubscriberDiagnostics = vi.fn();
const reconcileTribeSubscriptionProviderSubscribers = vi.fn();
const verifyTribeSubscriptionProviderPlan = vi.fn();
const verifyTribeSubscriptionProviderPlans = vi.fn();

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(),
  })
);

class MockJsonResponse {
  status: number;

  constructor(
    private readonly body: Record<string, unknown>,
    init?: ResponseInit
  ) {
    this.status = init?.status ?? 200;
  }

  static json(body: Record<string, unknown>, init?: ResponseInit) {
    return new MockJsonResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

function buildRequest() {
  return {
    headers: new Headers(),
  } as unknown as Request;
}

function buildTribeContext() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

function buildPriceContext() {
  return {
    params: Promise.resolve({
      priceId: "price-1",
      slug: "matematica-pro",
    }),
  };
}

describe("tribe subscription provider plan verification routes", () => {
  const activePrice = {
    activeSubscribersCount: 0,
    amountCents: 500000,
    createdAt: "2026-05-06T12:00:00.000Z",
    currency: "ARS" as const,
    frequency: "monthly" as const,
    id: "price-1",
    isCurrent: true,
    name: "Plan mensual",
    status: "active" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    (createServerLogger as Mock).mockReturnValue({
      error: vi.fn(),
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
          reconcileTribeSubscriptionProviderSubscribers,
          reconcileTribeSubscriberDiagnostics,
          verifyTribeSubscriptionProviderPlan,
          verifyTribeSubscriptionProviderPlans,
        },
      },
    });
  });

  it("should return current prices when all provider plans are verified", async () => {
    verifyTribeSubscriptionProviderPlans.mockResolvedValue({
      canceledPriceIds: [],
      freeJoinIsCurrent: false,
      prices: [activePrice],
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    });

    const response = await POST_VERIFY_ALL(buildRequest(), buildTribeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      canceledPriceIds: [],
      freeJoinIsCurrent: false,
      message: "Planes verificados con Mercado Pago.",
      prices: [activePrice],
      verifiedCount: 1,
    });
  });

  it("should return the canceled price when a provider plan is missing", async () => {
    verifyTribeSubscriptionProviderPlan.mockResolvedValue({
      freeJoinIsCurrent: true,
      price: {
        ...activePrice,
        isCurrent: false,
        status: "canceled" as const,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });

    const response = await POST_VERIFY_ONE(buildRequest(), buildPriceContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      freeJoinIsCurrent: true,
      message: "El plan figura cancelado en Mercado Pago.",
      price: {
        ...activePrice,
        isCurrent: false,
        status: "canceled" as const,
      },
    });
  });

  it("should return a provider-backed subscriber count for one price", async () => {
    reconcileTribeSubscriptionProviderSubscribers.mockResolvedValue({
      price: {
        ...activePrice,
      },
      providerActiveSubscribersCount: 2,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 3,
    });

    const response = await POST_VERIFY_SUBSCRIBERS(
      buildRequest(),
      buildPriceContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Suscriptores verificados con Mercado Pago.",
      price: {
        ...activePrice,
      },
      providerActiveSubscribersCount: 2,
      verifiedCount: 3,
    });
    expect(reconcileTribeSubscriptionProviderSubscribers).toHaveBeenCalledWith({
      priceId: "price-1",
      source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton,
      tribeSlug: "matematica-pro",
    });
  });

  it("should return a reconciled canceled price when provider subscribers are verified", async () => {
    const canceledPrice = {
      ...activePrice,
      activeSubscribersCount: 0,
      isCurrent: false,
      status: "canceled" as const,
    };
    reconcileTribeSubscriptionProviderSubscribers.mockResolvedValue({
      price: canceledPrice,
      providerActiveSubscribersCount: 0,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    });

    const response = await POST_VERIFY_SUBSCRIBERS(
      buildRequest(),
      buildPriceContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Suscriptores verificados con Mercado Pago.",
      price: canceledPrice,
      providerActiveSubscribersCount: 0,
      verifiedCount: 1,
    });
  });

  it("should return aggregate subscriber diagnostics when reconciliation succeeds", async () => {
    const diagnostics = {
      lastReconciledAt: "2026-05-12T01:05:00.000Z",
      localActiveSubscribersCount: 2,
      mercadoPagoAuthorizedSubscribersCount: 2,
      mercadoPagoCanceledOrMissingSubscribersCount: 1,
      mercadoPagoPausedSubscribersCount: 1,
      mercadoPagoPendingSubscribersCount: 3,
    };
    reconcileTribeSubscriberDiagnostics.mockResolvedValue({
      diagnostics,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 7,
    });

    const response = await POST_RECONCILE_DIAGNOSTICS(
      buildRequest(),
      buildTribeContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      diagnostics,
      message: "Diagnóstico actualizado con Mercado Pago.",
      verifiedCount: 7,
    });
    expect(reconcileTribeSubscriberDiagnostics).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("should return missing integration when diagnostics cannot reach Mercado Pago", async () => {
    reconcileTribeSubscriberDiagnostics.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration,
    });

    const response = await POST_RECONCILE_DIAGNOSTICS(
      buildRequest(),
      buildTribeContext()
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: "Conectá Mercado Pago antes de actualizar el diagnóstico.",
    });
  });

  it("should return forbidden when diagnostics reconciliation is not allowed", async () => {
    reconcileTribeSubscriberDiagnostics.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
    });

    const response = await POST_RECONCILE_DIAGNOSTICS(
      buildRequest(),
      buildTribeContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tenés permisos para actualizar el diagnóstico.",
    });
  });

  it("should return unauthorized when diagnostics reconciliation has no authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const response = await POST_RECONCILE_DIAGNOSTICS(
      buildRequest(),
      buildTribeContext()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Iniciá sesión para actualizar el diagnóstico.",
    });
  });

  it("should return a safe diagnostics error when reconciliation fails unexpectedly", async () => {
    reconcileTribeSubscriberDiagnostics.mockRejectedValue(
      new Error("provider token leaked")
    );

    const response = await POST_RECONCILE_DIAGNOSTICS(
      buildRequest(),
      buildTribeContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos actualizar el diagnóstico. Intentá de nuevo.",
    });
  });

  it("should return forbidden when the viewer cannot verify provider plans", async () => {
    verifyTribeSubscriptionProviderPlans.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
    });

    const response = await POST_VERIFY_ALL(buildRequest(), buildTribeContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tenés permisos para verificar planes.",
    });
  });

  it("should return unauthorized when there is no authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const response = await POST_VERIFY_ONE(buildRequest(), buildPriceContext());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Iniciá sesión para verificar planes.",
    });
  });
});
