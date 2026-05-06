import { POST } from "@/app/api/tribes/[slug]/subscriptions/start/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();
const startTribeMemberSubscription = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

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
    headers: new Headers({
      "x-idempotency-key": "request-1",
    }),
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

describe("tribe subscription start route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "member@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    startTribeMemberSubscription.mockResolvedValue({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout",
      status: "pending",
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      subscriptions: {
        useCases: {
          startTribeMemberSubscription,
        },
      },
    });
  });

  it("passes the invitation token to the subscription start use case", async () => {
    const response = await POST(
      buildRequest({
        invitationToken: "invitation-token-1",
      }),
      buildContext()
    );

    expect(response.status).toBe(200);
    expect(startTribeMemberSubscription).toHaveBeenCalledWith({
      idempotencyKey: "request-1",
      invitationToken: "invitation-token-1",
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects checkout starts when the invitation is invalid", async () => {
    startTribeMemberSubscription.mockResolvedValue({
      status: "invalid_invitation",
    });

    const response = await POST(
      buildRequest({
        invitationToken: "revoked-token",
      }),
      buildContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "La invitación no está disponible.",
    });
  });
});
