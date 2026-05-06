import { createHmac } from "crypto";

import { POST } from "@/app/api/mercado-pago/webhooks/route";
import { createRequestModules } from "@/src/modules/setup";

const handleMercadoPagoSubscriptionWebhook = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(() => ({
      error: jest.fn(),
      info: jest.fn(),
    })),
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

function buildWebhookSignature(resourceId: string, requestId: string, timestamp: string) {
  const manifest = `id:${resourceId};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac("sha256", "webhook-secret")
    .update(manifest)
    .digest("hex");

  return `ts=${timestamp},v1=${signature}`;
}

function buildWebhookRequest(headers: HeadersInit = {}) {
  return {
    headers: new Headers(headers),
    json: async () => ({
      action: "subscription_preapproval.created",
      data: {
        id: "preapproval-1",
      },
      id: "event-1",
    }),
    method: "POST",
    url: "https://tutribu.example.com/api/mercado-pago/webhooks",
  } as unknown as Request;
}

describe("Mercado Pago webhook route", () => {
  const previousWebhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = "webhook-secret";
    global.Response = MockJsonResponse as unknown as typeof Response;
    handleMercadoPagoSubscriptionWebhook.mockResolvedValue({
      status: "processed",
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      subscriptions: {
        useCases: {
          handleMercadoPagoSubscriptionWebhook,
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

  it("processes signed webhook payloads with a verified database context", async () => {
    const timestamp = String(Date.now());
    const requestId = "request-1";
    const response = await POST(
      buildWebhookRequest({
        "x-request-id": requestId,
        "x-signature": buildWebhookSignature("preapproval-1", requestId, timestamp),
      })
    );

    expect(response.status).toBe(200);
    expect(createRequestModules).toHaveBeenCalledWith({
      mercadoPagoWebhookVerified: true,
    });
    expect(handleMercadoPagoSubscriptionWebhook).toHaveBeenCalledWith({
      eventId: "event-1",
      resourceId: "preapproval-1",
      topic: "subscription_preapproval.created",
    });
  });

  it("asks Mercado Pago to retry when the subscription is not ready locally", async () => {
    handleMercadoPagoSubscriptionWebhook.mockResolvedValue({
      status: "retryable_webhook",
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
