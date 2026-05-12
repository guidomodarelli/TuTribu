import {
  createMercadoPagoPreapprovalPlan,
  createMercadoPagoPreapprovalSubscription,
  buildMercadoPagoPreapprovalPlanCheckoutUrl,
  getMercadoPagoPreapprovalDetails,
  getMercadoPagoPreapprovalPlan,
  getMercadoPagoPreapprovalPlanStatus,
  getMercadoPagoPreapprovalStatus,
  refreshMercadoPagoAccessToken,
  searchMercadoPagoPreapprovalPlans,
  updateMercadoPagoPreapprovalPlan,
  updateMercadoPagoPreapprovalSubscriptionStatus,
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

  afterEach(() => {
    jest.restoreAllMocks();
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
      expect.objectContaining({
        headers: {
          Authorization: "Bearer access-token",
        },
        method: "GET",
      })
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

  it("reads provider preapproval details needed to recover plan checkout returns", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        external_reference: "tutribu:price:price-1",
        id: "preapproval-1",
        preapproval_plan_id: "plan-1",
        status: "authorized",
      }),
      ok: true,
    });

    await expect(
      getMercadoPagoPreapprovalDetails({
        accessToken: "access-token",
        preapprovalId: "preapproval-1",
      })
    ).resolves.toEqual({
      externalReference: "tutribu:price:price-1",
      id: "preapproval-1",
      preapprovalPlanId: "plan-1",
      status: "authorized",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval/preapproval-1",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer access-token",
        },
        method: "GET",
      })
    );
  });

  it("should return null when Mercado Pago no longer has the preapproval", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        message: "Not-found",
      }),
      ok: false,
      status: 404,
    });

    await expect(
      getMercadoPagoPreapprovalStatus({
        accessToken: "access-token",
        preapprovalId: "preapproval-1",
      })
    ).resolves.toBeNull();
  });

  it("should read the provider plan status when Mercado Pago returns a subscription plan", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        status: "active",
      }),
      ok: true,
    });

    await expect(
      getMercadoPagoPreapprovalPlanStatus({
        accessToken: "access-token",
        preapprovalPlanId: "plan-1",
      })
    ).resolves.toBe("active");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval_plan/plan-1",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer access-token",
        },
        method: "GET",
      })
    );
  });

  it("should return null when Mercado Pago no longer has the subscription plan", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        message: "Not-found",
      }),
      ok: false,
      status: 404,
    });

    await expect(
      getMercadoPagoPreapprovalPlanStatus({
        accessToken: "access-token",
        preapprovalPlanId: "plan-1",
      })
    ).resolves.toBeNull();
  });

  it("should redact sensitive provider details when plan lookup fails", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        message: "Token APP_USR-secret-value failed for owner@example.com",
      }),
      ok: false,
      status: 500,
    });

    await expect(
      getMercadoPagoPreapprovalPlanStatus({
        accessToken: "access-token",
        preapprovalPlanId: "plan-1",
      })
    ).rejects.toThrow(
      "Mercado Pago request failed with status 500: Token [redacted] failed for [redacted]"
    );
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
        backUrl: "https://tutribu.example.com/tribu/matematica-pro",
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
        idempotencyKey: "tribe-price:matematica-pro:Plan mensual:120000:ARS:monthly",
        name: "Plan mensual",
        reason: "Plan mensual",
        trialFrequency: 7,
        trialFrequencyType: "days",
      })
    ).resolves.toBe("plan-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval_plan",
      expect.objectContaining({
        body: JSON.stringify({
          auto_recurring: {
            currency_id: "ARS",
            frequency: 1,
            frequency_type: "months",
            free_trial: {
              frequency: 7,
              frequency_type: "days",
            },
            transaction_amount: 1200,
          },
          back_url: "https://tutribu.example.com/tribu/matematica-pro",
          external_reference: "tutribu:price:price-1",
          reason: "Plan mensual",
        }),
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
          "X-Idempotency-Key":
            "tribe-price:matematica-pro:Plan mensual:120000:ARS:monthly",
        },
        method: "POST",
      })
    );
  });

  it("should update Mercado Pago preapproval plan mutable fields", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        auto_recurring: {
          currency_id: "ARS",
          transaction_amount: 1200,
        },
        external_reference: "tutribu:price:price-1",
        id: "plan-1",
        reason: "Plan actualizado",
        status: "active",
      }),
      ok: true,
    });

    await expect(
      updateMercadoPagoPreapprovalPlan({
        accessToken: "access-token",
        backUrl: "https://tutribu.example.com/tribu/matematica-pro",
        externalReference: "tutribu:price:price-1",
        preapprovalPlanId: "plan-1",
        reason: "Plan actualizado",
        status: "active",
        trialFrequency: 14,
        trialFrequencyType: "days",
      })
    ).resolves.toEqual({
      amountCents: 120000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan actualizado",
      status: "active",
      trial: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval_plan/plan-1",
      expect.objectContaining({
        body: JSON.stringify({
          auto_recurring: {
            free_trial: {
              frequency: 14,
              frequency_type: "days",
            },
          },
          back_url: "https://tutribu.example.com/tribu/matematica-pro",
          external_reference: "tutribu:price:price-1",
          reason: "Plan actualizado",
          status: "active",
        }),
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        method: "PUT",
      })
    );
  });

  it("should read Mercado Pago preapproval plan details", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        auto_recurring: {
          currency_id: "ARS",
          transaction_amount: 1200,
        },
        external_reference: "tutribu:price:price-1",
        id: "plan-1",
        reason: "Plan mensual",
        status: "active",
      }),
      ok: true,
    });

    await expect(
      getMercadoPagoPreapprovalPlan({
        accessToken: "access-token",
        preapprovalPlanId: "plan-1",
      })
    ).resolves.toMatchObject({
      amountCents: 120000,
      externalReference: "tutribu:price:price-1",
      reason: "Plan mensual",
      status: "active",
    });
  });

  it("should search Mercado Pago preapproval plans by external reference", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        results: [
          {
            external_reference: "tutribu:price:price-1",
            id: "plan-1",
            reason: "Plan mensual",
            status: "active",
          },
        ],
      }),
      ok: true,
    });

    await expect(
      searchMercadoPagoPreapprovalPlans({
        accessToken: "access-token",
        externalReference: "tutribu:price:price-1",
      })
    ).resolves.toMatchObject([
      {
        externalReference: "tutribu:price:price-1",
        id: "plan-1",
        reason: "Plan mensual",
        status: "active",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval_plan/search?external_reference=tutribu%3Aprice%3Aprice-1",
      expect.objectContaining({
        method: "GET",
      })
    );
  });

  it("should retry and trace Mercado Pago plan creation with redacted provider identifiers", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          message: "temporary provider outage",
        }),
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          id: "plan-secret-1234567890",
        }),
        ok: true,
        status: 200,
      });

    await expect(
      createMercadoPagoPreapprovalPlan({
        accessToken: "access-token",
        amountCents: 120000,
        backUrl: "https://tutribu.example.com/tribu/matematica-pro",
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
        idempotencyKey: "operation-1",
        name: "Plan mensual",
        reason: "Plan mensual",
        traceContext: {
          operationKey: "operation-1",
          priceId: "price-1",
          requestId: "request-1",
          tribeSlug: "matematica-pro",
        },
      })
    ).resolves.toBe("plan-secret-1234567890");

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [serializedRetryEntry] = warnSpy.mock.calls[0];
    const retryEntry = JSON.parse(serializedRetryEntry as string);

    expect(retryEntry).toMatchObject({
      level: "warn",
      operation: "create-mercado-pago-preapproval-plan",
      requestId: "request-1",
    });
    expect(retryEntry.metadata).toMatchObject({
      attempt: 1,
      operation_key: "operation-1",
      priceId: "price-1",
      result: "retry_scheduled",
      status: 503,
      tribeSlug: "matematica-pro",
    });

    const successLog = infoSpy.mock.calls
      .map(([serializedEntry]) => JSON.parse(serializedEntry as string))
      .find((entry) => entry.metadata?.result === "success");

    expect(successLog).toMatchObject({
      level: "info",
      operation: "create-mercado-pago-preapproval-plan",
      requestId: "request-1",
    });
    expect(successLog.metadata).toMatchObject({
      operation_key: "operation-1",
      priceId: "price-1",
      result: "success",
      tribeSlug: "matematica-pro",
    });
    expect(successLog.metadata.providerPlanId).toMatch(
      /^\[redacted:[a-f0-9]{12}\]$/
    );
    expect(
      [...infoSpy.mock.calls, ...warnSpy.mock.calls]
        .map(([serializedEntry]) => serializedEntry)
        .join("\n")
    ).not.toContain("plan-secret-1234567890");
  });

  it("builds Mercado Pago checkout URLs from the provider preapproval plan", () => {
    expect(buildMercadoPagoPreapprovalPlanCheckoutUrl("plan-1")).toBe(
      "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=plan-1"
    );
  });

  it("creates pending subscriptions associated to the current Mercado Pago plan", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        id: "preapproval-1",
        init_point:
          "https://www.mercadopago.com.ar/subscriptions/checkout?flow=provider&preapproval_id=preapproval-1",
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
        preapprovalPlanId: "plan-1",
        reason: "Plan mensual",
      })
    ).resolves.toEqual({
      checkoutUrl:
        "https://www.mercadopago.com.ar/subscriptions/checkout?flow=provider&preapproval_id=preapproval-1",
      providerSubscriptionId: "preapproval-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval",
      expect.objectContaining({
        body: JSON.stringify({
          back_url: "https://tutribu.example.com/tribu/matematica-pro",
          external_reference: "subscription-1",
          payer_email: "member@example.com",
          preapproval_plan_id: "plan-1",
          reason: "Plan mensual",
          status: "pending",
        }),
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
          "X-Idempotency-Key": "member-subscription-1",
        },
        method: "POST",
      })
    );
  });

  it("cancels a Mercado Pago preapproval subscription through the provider API", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        status: "canceled",
      }),
      ok: true,
    });

    await expect(
      updateMercadoPagoPreapprovalSubscriptionStatus({
        accessToken: "access-token",
        preapprovalId: "preapproval-1",
        status: "canceled",
      })
    ).resolves.toBe("canceled");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval/preapproval-1",
      expect.objectContaining({
        body: JSON.stringify({
          status: "canceled",
        }),
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        method: "PUT",
      })
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
        backUrl: "https://tutribu.example.com/tribu/matematica-pro",
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
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
        backUrl: "https://tutribu.example.com/tribu/matematica-pro",
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
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
