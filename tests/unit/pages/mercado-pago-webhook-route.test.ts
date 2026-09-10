import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { createHmac } from "crypto";

import { POST } from "@/app/api/mercado-pago/webhooks/route";
import { createRequestModules } from "@/src/modules/setup";
import {
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER,
} from "@/src/modules/shared/infrastructure/observability/request-context";

const handleMercadoPagoSubscriptionWebhook = vi.fn();
const syncMercadoPagoSubscriptionProviderPlanWebhook = vi.fn();
const mockServerLogger = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(() => mockServerLogger),
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

function buildWebhookSignature(resourceId: string, requestId: string, timestamp: string) {
  const manifest = `id:${resourceId};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac("sha256", "webhook-secret")
    .update(manifest)
    .digest("hex");

  return `ts=${timestamp},v1=${signature}`;
}

function buildWebhookRequest(
  headers: HeadersInit = {},
  url?: string,
  body: Record<string, unknown> = {
    action: "subscription_preapproval.created",
    data: {
      id: "preapproval-1",
    },
    id: "event-1",
  }
) {
  return {
    headers: new Headers(headers),
    json: async () => body,
    method: "POST",
    url: url ?? "https://tutribu.example.com/api/mercado-pago/webhooks",
  } as unknown as Request;
}

describe("Mercado Pago webhook route", () => {
  const previousWebhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = "webhook-secret";
    global.Response = MockJsonResponse as unknown as typeof Response;
    handleMercadoPagoSubscriptionWebhook.mockResolvedValue({
      status: "processed" as const,
    });
    syncMercadoPagoSubscriptionProviderPlanWebhook.mockResolvedValue({
      status: "verified" as const,
    });
    (createRequestModules as Mock).mockResolvedValue({
      subscriptions: {
        useCases: {
          handleMercadoPagoSubscriptionWebhook,
          syncMercadoPagoSubscriptionProviderPlanWebhook,
        },
      },
    });
  });

  afterEach(() => {
    if (previousWebhookSecret === undefined) {
      delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    } else {
      process.env.MERCADO_PAGO_WEBHOOK_SECRET = previousWebhookSecret;
    }
  });

  it("rejects webhook payloads without a valid Mercado Pago signature", async () => {
    const response = await POST(buildWebhookRequest());

    expect(response.status).toBe(401);
    expect(createRequestModules).not.toHaveBeenCalled();
    expect(handleMercadoPagoSubscriptionWebhook).not.toHaveBeenCalled();
  });

  it("does not log unverified webhook resource data when the signature is invalid", async () => {
    const response = await POST(
      buildWebhookRequest(
        {
          [REQUEST_ID_HEADER]: "request-1",
        },
        undefined,
        {
          action: "subscription_preapproval.created",
          data: {
            id: "attacker-controlled-resource",
          },
          id: "attacker-controlled-event",
        }
      )
    );

    expect(response.status).toBe(401);
    expect(mockServerLogger.warn).toHaveBeenCalledWith({
      message: "Mercado Pago webhook rejected",
      metadata: expect.objectContaining({
        hasEventId: true,
        hasResourceId: true,
        hasTopic: true,
        outcome: "unauthorized",
        status: 401,
      }),
    });
    expect(mockServerLogger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          eventId: expect.any(String),
          resourceId: expect.any(String),
          topic: expect.any(String),
        }),
      })
    );
  });

  it("does not log unverified webhook event data when the payload is invalid", async () => {
    const response = await POST(
      buildWebhookRequest(
        {
          [REQUEST_ID_HEADER]: "request-1",
        },
        undefined,
        {
          action: "",
          id: "attacker-controlled-event",
        }
      )
    );

    expect(response.status).toBe(400);
    expect(mockServerLogger.warn).toHaveBeenCalledWith({
      message: "Mercado Pago webhook rejected",
      metadata: expect.objectContaining({
        hasEventId: true,
        hasResourceId: false,
        hasTopic: false,
        outcome: "invalid_payload",
        status: 400,
      }),
    });
    expect(mockServerLogger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          eventId: expect.any(String),
        }),
      })
    );
  });

  it("processes signed webhook payloads with a verified database context", async () => {
    const timestamp = String(Date.now());
    const requestId = "request-1";
    const response = await POST(
      buildWebhookRequest({
        [REQUEST_ID_HEADER]: requestId,
        [TRACE_ID_HEADER]: "trace-1",
        "x-signature": buildWebhookSignature("preapproval-1", requestId, timestamp),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
    expect(response.headers.get(TRACE_ID_HEADER)).toBe("trace-1");
    expect(createRequestModules).toHaveBeenCalledWith({
      mercadoPagoWebhookVerified: true,
      requestId,
    });
    expect(handleMercadoPagoSubscriptionWebhook).toHaveBeenCalledWith({
      eventId: "event-1",
      resourceId: "preapproval-1",
      topic: "subscription_preapproval.created",
    });
  });

  it("preserves numeric Mercado Pago event ids for idempotency", async () => {
    const timestamp = String(Date.now());
    const requestId = "request-1";
    const response = await POST(
      buildWebhookRequest(
        {
          "x-request-id": requestId,
          "x-signature": buildWebhookSignature("preapproval-1", requestId, timestamp),
        },
        undefined,
        {
          action: "subscription_preapproval.updated",
          data: {
            id: "preapproval-1",
          },
          id: 123456789,
        }
      )
    );

    expect(response.status).toBe(200);
    expect(handleMercadoPagoSubscriptionWebhook).toHaveBeenCalledWith({
      eventId: "123456789",
      resourceId: "preapproval-1",
      topic: "subscription_preapproval.updated",
    });
  });

  it("processes subscription webhooks when Mercado Pago sends a generic action with a subscription type", async () => {
    const timestamp = String(Date.now());
    const requestId = "request-1";
    const response = await POST(
      buildWebhookRequest(
        {
          "x-request-id": requestId,
          "x-signature": buildWebhookSignature("preapproval-1", requestId, timestamp),
        },
        undefined,
        {
          action: "updated",
          data: {
            id: "preapproval-1",
          },
          id: "event-1",
          type: "subscription_preapproval",
        }
      )
    );

    expect(response.status).toBe(200);
    expect(createRequestModules).toHaveBeenCalledWith({
      mercadoPagoWebhookVerified: true,
      requestId,
    });
    expect(handleMercadoPagoSubscriptionWebhook).toHaveBeenCalledWith({
      eventId: "event-1",
      resourceId: "preapproval-1",
      topic: "subscription_preapproval",
    });
  });

  it("processes the Mercado Pago dashboard simulator subscription payload", async () => {
    const timestamp = String(Date.now());
    const requestId = "request-1";
    const response = await POST(
      buildWebhookRequest(
        {
          "x-request-id": requestId,
          "x-signature": buildWebhookSignature("123456", requestId, timestamp),
        },
        undefined,
        {
          action: "updated",
          application_id: "7171404559040283",
          data: {
            id: "123456",
          },
          date: "2021-11-01T02:02:02Z",
          entity: "preapproval",
          id: "123456",
          type: "subscription_preapproval",
          version: 8,
        }
      )
    );

    expect(response.status).toBe(200);
    expect(createRequestModules).toHaveBeenCalledWith({
      mercadoPagoWebhookVerified: true,
      requestId,
    });
    expect(handleMercadoPagoSubscriptionWebhook).toHaveBeenCalledWith({
      eventId: "123456",
      resourceId: "123456",
      topic: "subscription_preapproval",
    });
  });

  it("ignores signed webhook payloads for non-subscription topics", async () => {
    const timestamp = String(Date.now());
    const requestId = "request-1";
    const response = await POST(
      buildWebhookRequest(
        {
          "x-request-id": requestId,
          "x-signature": buildWebhookSignature("payment-1", requestId, timestamp),
        },
        undefined,
        {
          action: "payment.created",
          data: {
            id: "payment-1",
          },
          id: "payment-event-1",
        }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "processed" as const,
    });
    expect(createRequestModules).not.toHaveBeenCalled();
    expect(handleMercadoPagoSubscriptionWebhook).not.toHaveBeenCalled();
  });

  it("should process signed Mercado Pago subscription plan webhooks", async () => {
    const timestamp = String(Date.now());
    const requestId = "request-1";
    const response = await POST(
      buildWebhookRequest(
        {
          "x-request-id": requestId,
          "x-signature": buildWebhookSignature("plan-1", requestId, timestamp),
        },
        undefined,
        {
          action: "subscription_preapproval_plan.updated",
          data: {
            id: "plan-1",
          },
          id: "event-1",
        }
      )
    );

    expect(response.status).toBe(200);
    expect(handleMercadoPagoSubscriptionWebhook).not.toHaveBeenCalled();
    expect(syncMercadoPagoSubscriptionProviderPlanWebhook).toHaveBeenCalledWith({
      eventId: "event-1",
      resourceId: "plan-1",
      topic: "subscription_preapproval_plan.updated",
    });
  });

  it("asks Mercado Pago to retry when the subscription plan sync cannot access the provider", async () => {
    syncMercadoPagoSubscriptionProviderPlanWebhook.mockResolvedValue({
      status: "missing_integration" as const,
    });

    const timestamp = String(Date.now());
    const requestId = "request-1";
    const response = await POST(
      buildWebhookRequest(
        {
          "x-request-id": requestId,
          "x-signature": buildWebhookSignature("plan-1", requestId, timestamp),
        },
        undefined,
        {
          action: "subscription_preapproval_plan.updated",
          data: {
            id: "plan-1",
          },
          id: "event-1",
        }
      )
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos procesar el webhook.",
    });
    expect(handleMercadoPagoSubscriptionWebhook).not.toHaveBeenCalled();
    expect(syncMercadoPagoSubscriptionProviderPlanWebhook).toHaveBeenCalledWith({
      eventId: "event-1",
      resourceId: "plan-1",
      topic: "subscription_preapproval_plan.updated",
    });
  });

  it("uses the signed data id from the callback URL", async () => {
    const timestamp = String(Date.now());
    const requestId = "request-1";
    const response = await POST(
      buildWebhookRequest(
        {
          "x-request-id": requestId,
          "x-signature": buildWebhookSignature(
            "preapproval-from-url",
            requestId,
            timestamp
          ),
        },
        "https://tutribu.example.com/api/mercado-pago/webhooks?data.id=PREAPPROVAL-FROM-URL"
      )
    );

    expect(response.status).toBe(200);
    expect(handleMercadoPagoSubscriptionWebhook).toHaveBeenCalledWith({
      eventId: "event-1",
      resourceId: "preapproval-from-url",
      topic: "subscription_preapproval.created",
    });
  });

  it("asks Mercado Pago to retry when the subscription is not ready locally", async () => {
    handleMercadoPagoSubscriptionWebhook.mockResolvedValue({
      status: "retryable_webhook" as const,
    });

    const timestamp = String(Date.now());
    const requestId = "request-1";
    const response = await POST(
      buildWebhookRequest({
        "x-request-id": requestId,
        "x-signature": buildWebhookSignature("preapproval-1", requestId, timestamp),
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos procesar el webhook.",
    });
  });
});
