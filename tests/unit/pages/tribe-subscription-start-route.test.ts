import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { POST } from "@/app/api/tribes/[slug]/subscriptions/start/route";
import { createRequestModules } from "@/src/modules/setup";
import {
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER,
} from "@/src/modules/shared/infrastructure/observability/request-context";
import { createHash } from "crypto";

const getAuthenticatedMember = vi.fn();
const startTribeMemberSubscription = vi.fn();
const retryTribeMemberSubscriptionPayment = vi.fn();

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashIdempotencyKey(idempotencyKey: string): string {
  return createHash("sha256").update(idempotencyKey).digest("hex");
}

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(() => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    })),
  })
);

class MockJsonResponse {
  headers: Headers;
  status: number;

  constructor(
    private readonly body: Record<string, unknown>,
    init?: ResponseInit
  ) {
    this.headers = new Headers(init?.headers);
    this.status = init?.status ?? 200;
  }

  static json(body: Record<string, unknown>, init?: ResponseInit) {
    return new MockJsonResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

function buildRequest(
  body: Record<string, unknown> = {},
  headers: HeadersInit = {}
) {
  return {
    headers: new Headers({
      "x-idempotency-key": "request-1",
      ...headers,
    }),
    json: async () => body,
  } as unknown as Request;
}

function buildRequestWithoutIdempotencyHeader(body: Record<string, unknown> = {}) {
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

describe("tribe subscription start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      status: "pending" as const,
    });
    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      subscriptions: {
        useCases: {
          retryTribeMemberSubscriptionPayment,
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
    expect(response.headers.get(REQUEST_ID_HEADER)).toEqual(expect.any(String));
    expect(startTribeMemberSubscription).toHaveBeenCalledWith({
      idempotencyKey: [
        "member-1",
        "matematica-pro",
        hashInvitationToken("invitation-token-1"),
        hashIdempotencyKey("request-1"),
      ].join(":"),
      invitationToken: "invitation-token-1",
      tribeSlug: "matematica-pro",
    });
  });

  it("builds a stable idempotency key from the invitation when the header is missing", async () => {
    const response = await POST(
      buildRequestWithoutIdempotencyHeader({
        invitationToken: "invitation-token-1",
      }),
      buildContext()
    );

    expect(response.status).toBe(200);
    expect(startTribeMemberSubscription).toHaveBeenCalledWith({
      idempotencyKey: [
        "member-1",
        "matematica-pro",
        hashInvitationToken("invitation-token-1"),
        hashIdempotencyKey("invitation-token-1"),
      ].join(":"),
      invitationToken: "invitation-token-1",
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects checkout starts when the invitation is invalid", async () => {
    startTribeMemberSubscription.mockResolvedValue({
      status: "invalid_invitation" as const,
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

  it("redirects the retry button to the subscription page when the member already has a live subscription", async () => {
    retryTribeMemberSubscriptionPayment.mockResolvedValue({
      status: "already_subscribed" as const,
    });

    const response = await POST(buildRequest({}), buildContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      subscriptionUrl: "/matematica-pro/suscripcion",
    });
  });

  it("starts a direct payment retry when no invitation token is provided", async () => {
    retryTribeMemberSubscriptionPayment.mockResolvedValue({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout",
      status: "pending" as const,
    });

    const response = await POST(
      buildRequest(
        {},
        {
          [REQUEST_ID_HEADER]: "correlation-1",
          [TRACE_ID_HEADER]: "trace-1",
        }
      ),
      buildContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("correlation-1");
    expect(response.headers.get(TRACE_ID_HEADER)).toBe("trace-1");
    expect(retryTribeMemberSubscriptionPayment).toHaveBeenCalledWith({
      idempotencyKey: [
        "member-1",
        "matematica-pro",
        hashInvitationToken(""),
        hashIdempotencyKey("request-1"),
      ].join(":"),
      tribeSlug: "matematica-pro",
    });
    expect(startTribeMemberSubscription).not.toHaveBeenCalled();
  });
});
