import { POST } from "@/app/api/tribes/[slug]/subscriptions/prices/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/tribes/[slug]/subscriptions/prices/[priceId]/route";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const createTribeSubscriptionPrice = jest.fn();
const deleteTribeSubscriptionPrice = jest.fn();
const updateTribeSubscriptionPrice = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
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
    jest.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    (createServerLogger as jest.Mock).mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      subscriptions: {
        useCases: {
          createTribeSubscriptionPrice,
          deleteTribeSubscriptionPrice,
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
        status: "active",
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
      tribeSlug: "matematica-pro",
    });
    expect(createServerLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "update-tribe-subscription-price",
      })
    );
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
        status: "canceled",
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
        status: "canceled",
      },
    });
  });
});
