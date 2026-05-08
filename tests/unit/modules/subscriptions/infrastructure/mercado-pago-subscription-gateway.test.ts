import {
  createMercadoPagoPreapprovalPlan,
  createMercadoPagoPreapprovalSubscription,
  getMercadoPagoPreapprovalStatus,
  refreshMercadoPagoAccessToken,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";

describe("mercado pago subscription gateway", () => {
  const fetchMock = jest.fn();
  const previousFetch = global.fetch;
  const previousBaseUrl = process.env.BETTER_AUTH_URL;
  const previousClientId = process.env.MERCADO_PAGO_CLIENT_ID;
  const previousClientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";
    process.env.MERCADO_PAGO_CLIENT_ID = "client-id";
    process.env.MERCADO_PAGO_CLIENT_SECRET = "client-secret";
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = previousFetch;

    if (previousBaseUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBaseUrl;
    }

    if (previousClientId === undefined) {
      delete process.env.MERCADO_PAGO_CLIENT_ID;
    } else {
      process.env.MERCADO_PAGO_CLIENT_ID = previousClientId;
    }

    if (previousClientSecret === undefined) {
      delete process.env.MERCADO_PAGO_CLIENT_SECRET;
    } else {
      process.env.MERCADO_PAGO_CLIENT_SECRET = previousClientSecret;
    }
  });

  it("reads the provider preapproval status from Mercado Pago", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        status: "authorized",
      }),
      ok: true,
    });

    await expect(
      getMercadoPagoPreapprovalStatus({
        accessToken: "access-token",
        preapprovalId: "preapproval-1",
      })
    ).resolves.toBe("authorized");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval/preapproval-1",
      {
        headers: {
          Authorization: "Bearer access-token",
        },
        method: "GET",
      }
    );
  });

  it("rejects provider responses without a preapproval status", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({}),
      ok: true,
    });

    await expect(
      getMercadoPagoPreapprovalStatus({
        accessToken: "access-token",
        preapprovalId: "preapproval-1",
      })
    ).rejects.toThrow("Mercado Pago preapproval response did not include status");
  });

  it("creates Mercado Pago preapproval plans with the recurring price payload", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        id: "plan-1",
      }),
      ok: true,
    });

    await expect(
      createMercadoPagoPreapprovalPlan({
        accessToken: "access-token",
        amountCents: 120000,
        currency: "ARS",
        idempotencyKey: "tribe-price:matematica-pro:Plan mensual:120000:ARS:monthly",
        name: "Plan mensual",
        reason: "Plan mensual",
      })
    ).resolves.toBe("plan-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval_plan",
      {
        body: JSON.stringify({
          auto_recurring: {
            currency_id: "ARS",
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 1200,
          },
          back_url: "https://tutribu.example.com",
          reason: "Plan mensual",
        }),
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
          "X-Idempotency-Key":
            "tribe-price:matematica-pro:Plan mensual:120000:ARS:monthly",
        },
        method: "POST",
      }
    );
  });

  it("creates pending subscriptions without an associated plan for checkout redirects", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        id: "preapproval-1",
        init_point: "https://www.mercadopago.com.ar/subscriptions/checkout",
      }),
      ok: true,
    });

    await expect(
      createMercadoPagoPreapprovalSubscription({
        accessToken: "access-token",
        amountCents: 1500,
        backUrl: "https://tutribu.example.com/tribu/matematica-pro",
        currency: "ARS",
        externalReference: "subscription-1",
        idempotencyKey: "member-subscription-1",
        payerEmail: "member@example.com",
        reason: "Plan mensual",
      })
    ).resolves.toEqual({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout",
      providerSubscriptionId: "preapproval-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval",
      {
        body: JSON.stringify({
          auto_recurring: {
            currency_id: "ARS",
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 15,
          },
          back_url: "https://tutribu.example.com/tribu/matematica-pro",
          external_reference: "subscription-1",
          payer_email: "member@example.com",
          reason: "Plan mensual",
          status: "pending",
        }),
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
          "X-Idempotency-Key": "member-subscription-1",
        },
        method: "POST",
      }
    );
  });

  it("includes safe Mercado Pago rejection details when plan creation fails", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        cause: [
          {
            code: "invalid_back_url",
            description: "back_url must be an HTTPS URL",
          },
          {
            description: "access_token TEST-123 must not be logged",
          },
        ],
        message: "Invalid request",
      }),
      ok: false,
      status: 400,
    });

    await expect(
      createMercadoPagoPreapprovalPlan({
        accessToken: "access-token",
        amountCents: 120000,
        currency: "ARS",
        idempotencyKey: "tribe-price:matematica-pro:Plan mensual:120000:ARS:monthly",
        name: "Plan mensual",
        reason: "Plan mensual",
      })
    ).rejects.toThrow(
      "Mercado Pago request failed with status 400: Invalid request; invalid_back_url: back_url must be an HTTPS URL; access_token [redacted] must not be logged"
    );
  });

  it("keeps the provider status message when rejection body is null", async () => {
    fetchMock.mockResolvedValue({
      json: async () => null,
      ok: false,
      status: 502,
    });

    await expect(
      createMercadoPagoPreapprovalPlan({
        accessToken: "access-token",
        amountCents: 120000,
        currency: "ARS",
        idempotencyKey: "tribe-price:matematica-pro:Plan mensual:120000:ARS:monthly",
        name: "Plan mensual",
        reason: "Plan mensual",
      })
    ).rejects.toThrow("Mercado Pago request failed with status 502");
  });

  it("refreshes Mercado Pago OAuth tokens with the stored refresh token", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        access_token: "fresh-access-token",
        expires_in: 3600,
        refresh_token: "new-refresh-token",
        user_id: 123,
      }),
      ok: true,
    });

    await expect(
      refreshMercadoPagoAccessToken("stored-refresh-token")
    ).resolves.toEqual({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "123",
      refreshToken: "new-refresh-token",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/oauth/token",
      expect.objectContaining({
        body: JSON.stringify({
          client_id: "client-id",
          client_secret: "client-secret",
          grant_type: "refresh_token",
          refresh_token: "stored-refresh-token",
        }),
        method: "POST",
      })
    );
  });
});
