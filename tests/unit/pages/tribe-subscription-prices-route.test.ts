import { POST } from "@/app/api/tribes/[slug]/subscriptions/prices/route";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const createTribeSubscriptionPrice = jest.fn();

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
});
