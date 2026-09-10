import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { POST } from "@/app/api/tribes/[slug]/subscriptions/prices/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/tribes/[slug]/subscriptions/prices/[priceId]/route";
import { PATCH as PATCH_PAYMENT_ACCOUNT } from "@/app/api/tribes/[slug]/subscriptions/mercado-pago-accounts/[paymentIntegrationId]/route";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const createTribeSubscriptionPrice = vi.fn();
const deleteTribeSubscriptionPrice = vi.fn();
const updateTribeSubscriptionPrice = vi.fn();
const updateTribePaymentIntegrationAccountLabel = vi.fn();
const PAYMENT_INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";

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

function buildRequest(body: Record<string, unknown> = {}) {
  return {
    headers: new Headers(),
    json: async () => body,
  } as unknown as Request;
}

function buildContext() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("tribe subscription prices route", () => {
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
          createTribeSubscriptionPrice,
          deleteTribeSubscriptionPrice,
          updateTribePaymentIntegrationAccountLabel,
          updateTribeSubscriptionPrice,
        },
      },
    });
  });

  it("returns an amount field error when the monthly price is lower than the provider minimum", async () => {
    createTribeSubscriptionPrice.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });

    const response = await POST(
      buildRequest({
        amount: "14.99",
        name: "Plan mensual",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      fieldErrors: {
        amount: "El precio mensual mínimo es $ 15.",
      },
      message: "Definí un nombre y un precio mensual válido.",
    });
  });

  it("keeps generic invalid input responses when the amount is not below the provider minimum", async () => {
    createTribeSubscriptionPrice.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });

    const response = await POST(
      buildRequest({
        amount: "1500",
        name: "",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Definí un nombre y un precio mensual válido.",
    });
  });

  it("returns a trial field error when the free trial is outside the allowed range", async () => {
    createTribeSubscriptionPrice.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });

    const response = await POST(
      buildRequest({
        amount: "1500",
        name: "Plan mensual",
        trialFrequency: "15",
        trialFrequencyType: "days",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      fieldErrors: {
        trialFrequency: "La prueba gratis debe ser de entre 1 y 14 días.",
      },
      message: "Definí un nombre, un precio mensual y una prueba gratis válidos.",
    });
  });

  it("returns a trial field error when the free trial type is omitted from price creation", async () => {
    createTribeSubscriptionPrice.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });

    const response = await POST(
      buildRequest({
        amount: "1500",
        name: "Plan mensual",
        trialFrequency: "15",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      fieldErrors: {
        trialFrequency: "La prueba gratis debe ser de entre 1 y 14 días.",
      },
      message: "Definí un nombre, un precio mensual y una prueba gratis válidos.",
    });
  });

  it("returns a trial field error when the free trial type is blank in price creation", async () => {
    createTribeSubscriptionPrice.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });

    const response = await POST(
      buildRequest({
        amount: "1500",
        name: "Plan mensual",
        trialFrequency: "15",
        trialFrequencyType: "",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      fieldErrors: {
        trialFrequency: "La prueba gratis debe ser de entre 1 y 14 días.",
      },
      message: "Definí un nombre, un precio mensual y una prueba gratis válidos.",
    });
  });

  it("should preserve omitted trial frequency type in legacy price creation requests", async () => {
    createTribeSubscriptionPrice.mockResolvedValue({
      price: {
        activeSubscribersCount: 0,
        amountCents: 500000,
        createdAt: "2026-05-06T12:00:00.000Z",
        currency: "ARS",
        frequency: "monthly",
        id: "price-1",
        isCurrent: false,
        name: "Plan mensual",
        status: "active" as const,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
    });

    const response = await POST(
      buildRequest({
        amount: "5000",
        name: "Plan mensual",
        paymentIntegrationId: PAYMENT_INTEGRATION_ID,
        trialFrequency: "14",
      }),
      buildContext()
    );

    expect(response.status).toBe(201);
    expect(createTribeSubscriptionPrice).toHaveBeenCalledWith({
      amount: "5000",
      name: "Plan mensual",
      paymentIntegrationId: PAYMENT_INTEGRATION_ID,
      trialFrequency: "14",
      trialFrequencyType: undefined,
      tribeSlug: "matematica-pro",
    });
  });

  it("should pass the selected Mercado Pago account to price creation", async () => {
    createTribeSubscriptionPrice.mockResolvedValue({
      price: {
        activeSubscribersCount: 0,
        amountCents: 500000,
        createdAt: "2026-05-06T12:00:00.000Z",
        currency: "ARS",
        frequency: "monthly",
        id: "price-1",
        isCurrent: false,
        mercadoPagoAccountLabel: "Cuenta principal",
        name: "Plan mensual",
        paymentIntegrationId: PAYMENT_INTEGRATION_ID,
        status: "active" as const,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
    });

    const response = await POST(
      buildRequest({
        amount: "5000",
        name: "Plan mensual",
        paymentIntegrationId: PAYMENT_INTEGRATION_ID,
      }),
      buildContext()
    );

    expect(response.status).toBe(201);
    expect(createTribeSubscriptionPrice).toHaveBeenCalledWith({
      amount: "5000",
      name: "Plan mensual",
      paymentIntegrationId: PAYMENT_INTEGRATION_ID,
      trialFrequency: undefined,
      trialFrequencyType: undefined,
      tribeSlug: "matematica-pro",
    });
  });

  it("should update a Mercado Pago account label", async () => {
    updateTribePaymentIntegrationAccountLabel.mockResolvedValue({
      account: {
        accountLabel: "Cuenta principal",
        id: PAYMENT_INTEGRATION_ID,
        providerAccountEmail: null,
        providerAccountId: "collector-1",
        status: "connected" as const,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });

    const response = await PATCH_PAYMENT_ACCOUNT(
      buildRequest({
        accountLabel: "Cuenta principal",
      }),
      {
        params: Promise.resolve({
          paymentIntegrationId: PAYMENT_INTEGRATION_ID,
          slug: "matematica-pro",
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      account: {
        accountLabel: "Cuenta principal",
        id: PAYMENT_INTEGRATION_ID,
        providerAccountEmail: null,
        providerAccountId: "collector-1",
        status: "connected" as const,
      },
      message: "Alias actualizado.",
    });
    expect(updateTribePaymentIntegrationAccountLabel).toHaveBeenCalledWith({
      accountLabel: "Cuenta principal",
      paymentIntegrationId: PAYMENT_INTEGRATION_ID,
      tribeSlug: "matematica-pro",
    });
  });

  it("should return a validation error for malformed Mercado Pago account ids", async () => {
    updateTribePaymentIntegrationAccountLabel.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });

    const response = await PATCH_PAYMENT_ACCOUNT(
      buildRequest({
        accountLabel: "Cuenta principal",
      }),
      {
        params: Promise.resolve({
          paymentIntegrationId: "integration-1",
          slug: "matematica-pro",
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Definí un alias de cuenta válido.",
    });
  });

  it("should update one price from the item route", async () => {
    updateTribeSubscriptionPrice.mockResolvedValue({
      price: {
        activeSubscribersCount: 0,
        amountCents: 500000,
        createdAt: "2026-05-06T12:00:00.000Z",
        currency: "ARS",
        frequency: "monthly",
        id: "price-1",
        isCurrent: false,
        name: "Plan actualizado",
        status: "active" as const,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });

    const response = await PATCH(
      buildRequest({
        amount: "5000",
        name: "Plan actualizado",
        trialFrequency: "14",
        trialFrequencyType: "days",
      }),
      {
        params: Promise.resolve({
          priceId: "price-1",
          slug: "matematica-pro",
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "Precio actualizado.",
      price: {
        name: "Plan actualizado",
      },
    });
    expect(updateTribeSubscriptionPrice).toHaveBeenCalledWith({
      amount: "5000",
      name: "Plan actualizado",
      priceId: "price-1",
      trialFrequency: "14",
      trialFrequencyType: "days",
      tribeSlug: "matematica-pro",
    });
    expect(createServerLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "update-tribe-subscription-price",
      })
    );
  });

  it("should preserve omitted trial fields in legacy price update requests", async () => {
    updateTribeSubscriptionPrice.mockResolvedValue({
      price: {
        activeSubscribersCount: 0,
        amountCents: 500000,
        createdAt: "2026-05-06T12:00:00.000Z",
        currency: "ARS",
        frequency: "monthly",
        id: "price-1",
        isCurrent: false,
        name: "Plan actualizado",
        status: "active" as const,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });

    const response = await PATCH(
      buildRequest({
        amount: "5000",
        name: "Plan actualizado",
      }),
      {
        params: Promise.resolve({
          priceId: "price-1",
          slug: "matematica-pro",
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(updateTribeSubscriptionPrice).toHaveBeenCalledWith({
      amount: "5000",
      name: "Plan actualizado",
      priceId: "price-1",
      trialFrequency: undefined,
      trialFrequencyType: undefined,
      tribeSlug: "matematica-pro",
    });
  });

  it("returns a trial field error when the free trial type is omitted from price updates", async () => {
    updateTribeSubscriptionPrice.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });

    const response = await PATCH(
      buildRequest({
        amount: "5000",
        name: "Plan actualizado",
        trialFrequency: "21",
      }),
      {
        params: Promise.resolve({
          priceId: "price-1",
          slug: "matematica-pro",
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      fieldErrors: {
        trialFrequency: "La prueba gratis debe ser de entre 1 y 14 días.",
      },
      message: "Definí un nombre, un precio mensual y una prueba gratis válidos.",
    });
  });

  it("returns a trial field error when the free trial type is blank in price updates", async () => {
    updateTribeSubscriptionPrice.mockResolvedValue({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });

    const response = await PATCH(
      buildRequest({
        amount: "5000",
        name: "Plan actualizado",
        trialFrequency: "21",
        trialFrequencyType: "",
      }),
      {
        params: Promise.resolve({
          priceId: "price-1",
          slug: "matematica-pro",
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      fieldErrors: {
        trialFrequency: "La prueba gratis debe ser de entre 1 y 14 días.",
      },
      message: "Definí un nombre, un precio mensual y una prueba gratis válidos.",
    });
  });

  it("should return a canceled price from the item delete route", async () => {
    deleteTribeSubscriptionPrice.mockResolvedValue({
      price: {
        activeSubscribersCount: 0,
        amountCents: 500000,
        createdAt: "2026-05-06T12:00:00.000Z",
        currency: "ARS",
        frequency: "monthly",
        id: "price-1",
        isCurrent: false,
        name: "Plan mensual",
        status: "canceled" as const,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
    });

    const response = await DELETE(buildRequest(), {
      params: Promise.resolve({
        priceId: "price-1",
        slug: "matematica-pro",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "Precio cancelado.",
      price: {
        status: "canceled" as const,
      },
    });
  });
});
