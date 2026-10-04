import { vi, describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import {
  createMercadoPagoPreapprovalPlan,
  createMercadoPagoPreapprovalSubscription,
  createMercadoPagoPendingPreapprovalSubscription,
  findMercadoPagoSubscriptionCheckoutByReference,
  getMercadoPagoPreapprovalDetails,
  getMercadoPagoPreapprovalPlan,
  getMercadoPagoPreapprovalPlanStatus,
  getMercadoPagoPreapprovalStatus,
  refreshMercadoPagoAccessToken,
  searchMercadoPagoAuthorizedPayments,
  searchMercadoPagoPreapprovalPlans,
  updateMercadoPagoPreapprovalBackUrl,
  updateMercadoPagoPreapprovalPlan,
  updateMercadoPagoPreapprovalSubscriptionStatus,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";

describe("mercado pago subscription gateway", () => {
  const fetchMock = vi.fn();
  const previousFetch = global.fetch;
  const previousBaseUrl = process.env.BETTER_AUTH_URL;
  const previousClientId = process.env.MERCADO_PAGO_CLIENT_ID;
  const previousClientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";
    process.env.MERCADO_PAGO_CLIENT_ID = "client-id";
    process.env.MERCADO_PAGO_CLIENT_SECRET = "client-secret";
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("should create a hosted pending subscription from the frozen monthly terms without a card token", async () => {
    fetchMock.mockImplementation(async (_requestUrl: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      const recurring = body.auto_recurring;
      const isHostedPendingCheckout =
        body.status === "pending" &&
        !("preapproval_plan_id" in body) &&
        !("card_token_id" in body) &&
        recurring?.frequency === 1 &&
        recurring?.frequency_type === "months" &&
        recurring?.transaction_amount === 30 &&
        recurring?.currency_id === "ARS" &&
        !("free_trial" in recurring);
      return {
        ok: isHostedPendingCheckout,
        status: isHostedPendingCheckout ? 201 : 400,
        json: async () => isHostedPendingCheckout
          ? { id: "pending-subscription-1", init_point: "https://checkout.example/pending-subscription-1" }
          : { message: "card_token_id is required" },
      };
    });

    await expect(createMercadoPagoPendingPreapprovalSubscription({
      accessToken: "access-token",
      amountCents: 3000,
      backUrl: "https://tutribu.example.com/tribe/academia",
      currency: "ARS",
      externalReference: "academy-reservation-1",
      idempotencyKey: "academy-checkout:reservation-1",
      payerEmail: "buyer@example.com",
      reason: "Academia mensual",
    })).resolves.toEqual({
      checkoutUrl: "https://checkout.example/pending-subscription-1",
      providerSubscriptionId: "pending-subscription-1",
    });
  });

  it("should recover only the checkout matching the reservation reference", async () => {
    fetchMock.mockImplementation(async (requestUrl: string) => {
      const url = new URL(requestUrl);
      const body = url.pathname.endsWith("/search")
        ? (url.searchParams.get("q") === "reservation-1"
          ? { paging: { total: 1 }, results: [{ id: "recovered-1", external_reference: "reservation-1" }] }
          : { paging: { total: 2 }, results: [{ id: "unrelated", external_reference: "other" }, { id: "recovered-1", external_reference: "reservation-1" }] })
        : { id: "recovered-1", external_reference: "reservation-1", status: "pending", init_point: "https://checkout.example/recovered" };
      return { ok: true, status: 200, json: async () => body };
    });
    await expect(findMercadoPagoSubscriptionCheckoutByReference({ accessToken: "access-token", externalReference: "reservation-1" }))
      .resolves.toEqual({ providerSubscriptionId: "recovered-1", checkoutUrl: "https://checkout.example/recovered" });
  });

  it("should not retry subscription creation after an ambiguous transport failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Connection lost after sending request"));
    await expect(createMercadoPagoPendingPreapprovalSubscription({
      accessToken: "access-token", amountCents: 3000, backUrl: "https://tutribu.example.com/academy", currency: "ARS",
      externalReference: "reservation-1", idempotencyKey: "checkout-1", payerEmail: "buyer@example.com", reason: "Academia",
    })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should refuse ambiguous recovery when multiple subscriptions share the reference", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ paging: { total: 2 }, results: [
      { id: "first", external_reference: "reservation-1" }, { id: "second", external_reference: "reservation-1" },
    ] }) });
    await expect(findMercadoPagoSubscriptionCheckoutByReference({ accessToken: "access-token", externalReference: "reservation-1" })).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should retain the HTTP status and operation when the provider rejects a request", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: "Invalid request" }) });
    await expect(getMercadoPagoPreapprovalStatus({ accessToken: "access-token", preapprovalId: "preapproval-1" }))
      .rejects.toMatchObject({ statusCode: 400, operation: "get-mercado-pago-preapproval-status" });
  });

  it("should translate local cancellation into the provider cancelled status", async () => {
    fetchMock.mockImplementation(async (_requestUrl: string, options: RequestInit) => {
      const accepted = JSON.parse(String(options.body)).status === "cancelled";
      return { ok: accepted, status: accepted ? 200 : 400, json: async () => ({ status: accepted ? "cancelled" : "invalid" }) };
    });
    await expect(updateMercadoPagoPreapprovalSubscriptionStatus({ accessToken: "access-token", preapprovalId: "subscription-1", status: "canceled" }))
      .resolves.toBe("cancelled");
  });

  it("should confirm cancellation when a repeated cancellation is rejected but the subscription is already cancelled", async () => {
    fetchMock.mockImplementation(async (_requestUrl: string, options: RequestInit) => ({
      ok: options.method === "GET", status: options.method === "GET" ? 200 : 400,
      json: async () => options.method === "GET" ? { status: "cancelled" } : { message: "Subscription already cancelled" },
    }));
    await expect(updateMercadoPagoPreapprovalSubscriptionStatus({ accessToken: "access-token", preapprovalId: "subscription-1", status: "canceled" }))
      .resolves.toBe("cancelled");
  });

  it("should retrieve every invoice when the provider rejects unsupported page sizes", async () => {
    const providerPageSize = 12;
    const invoices = Array.from({ length: 13 }, (_, invoiceIndex) => ({
      id: `invoice-${invoiceIndex}`,
      preapproval_id: "preapproval-1",
      transaction_amount: "15.00",
      currency_id: "ARS",
      payment: { id: `payment-${invoiceIndex}`, status: "approved", status_detail: "accredited" },
    }));
    fetchMock.mockImplementation(async (requestUrl: string) => {
      const query = new URL(requestUrl).searchParams;
      const limit = Number(query.get("limit"));
      const offset = Number(query.get("offset"));
      if (limit !== providerPageSize) {
        return { ok: false, status: 400, json: async () => ({ message: "Invalid value for limit" }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          paging: { limit: providerPageSize, offset, total: invoices.length },
          results: invoices.slice(offset, offset + limit),
        }),
      };
    });

    const result = await searchMercadoPagoAuthorizedPayments({
      accessToken: "access-token",
      preapprovalId: "preapproval-1",
    });

    expect(result.map((invoice) => invoice.id)).toEqual(invoices.map((invoice) => invoice.id));
    expect(result.at(-1)).toMatchObject({ transactionAmount: 15, paymentStatus: "approved" });
  });

  it("should not skip invoices when the provider returns smaller pages than requested", async () => {
    const providerPageSize = 2;
    const invoices = Array.from({ length: 5 }, (_, invoiceIndex) => ({ id: `invoice-${invoiceIndex}` }));
    fetchMock.mockImplementation(async (requestUrl: string) => {
      const offset = Number(new URL(requestUrl).searchParams.get("offset"));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          paging: { limit: providerPageSize, offset, total: invoices.length },
          results: invoices.slice(offset, offset + providerPageSize),
        }),
      };
    });

    const result = await searchMercadoPagoAuthorizedPayments({
      accessToken: "access-token",
      preapprovalId: "preapproval-1",
    });

    expect(result.map((invoice) => invoice.id)).toEqual(invoices.map((invoice) => invoice.id));
  });

  it("should reject an incomplete history when the provider stops returning remaining invoices", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ paging: { total: 2 }, results: [{ id: "invoice-1" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ paging: { total: 2 }, results: [] }),
      });

    await expect(searchMercadoPagoAuthorizedPayments({
      accessToken: "access-token",
      preapprovalId: "preapproval-1",
    })).rejects.toThrow("incomplete invoice history");
  });

  it("should reject an incomplete history when the pagination guard is exhausted", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ paging: { total: 51 }, results: [{ id: "invoice-1" }] }),
    });

    await expect(searchMercadoPagoAuthorizedPayments({
      accessToken: "access-token",
      preapprovalId: "preapproval-1",
    })).rejects.toThrow("maximum page count");
  });

  it("reads the provider preapproval status from Mercado Pago", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        status: "authorized" as const,
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
        status: "authorized" as const,
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
      status: "authorized" as const,
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
        status: "active" as const,
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
        backUrl: "https://tutribu.example.com/matematica-pro",
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
          back_url: "https://tutribu.example.com/matematica-pro",
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
        status: "active" as const,
      }),
      ok: true,
    });

    await expect(
      updateMercadoPagoPreapprovalPlan({
        accessToken: "access-token",
        amountCents: 150000,
        backUrl: "https://tutribu.example.com/matematica-pro",
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
        frequency: "monthly",
        preapprovalPlanId: "plan-1",
        reason: "Plan actualizado",
        status: "active" as const,
        trialFrequency: 14,
        trialFrequencyType: "days",
      })
    ).resolves.toEqual({
      amountCents: 120000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan actualizado",
      status: "active" as const,
      trial: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval_plan/plan-1",
      expect.objectContaining({
        body: JSON.stringify({
          auto_recurring: {
            currency_id: "ARS",
            frequency: 1,
            frequency_type: "months",
            free_trial: {
              frequency: 14,
              frequency_type: "days",
            },
            transaction_amount: 1500,
          },
          back_url: "https://tutribu.example.com/matematica-pro",
          external_reference: "tutribu:price:price-1",
          reason: "Plan actualizado",
          status: "active" as const,
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
        status: "active" as const,
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
      status: "active" as const,
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
            status: "active" as const,
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
        status: "active" as const,
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
    const infoSpy = vi.spyOn(console, "info").mockImplementation(function () {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(function () {});

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
        backUrl: "https://tutribu.example.com/matematica-pro",
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
        backUrl: "https://tutribu.example.com/matematica-pro",
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
          back_url: "https://tutribu.example.com/matematica-pro",
          external_reference: "subscription-1",
          payer_email: "member@example.com",
          preapproval_plan_id: "plan-1",
          reason: "Plan mensual",
          status: "pending" as const,
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
        status: "canceled" as const,
      }),
      ok: true,
    });

    await expect(
      updateMercadoPagoPreapprovalSubscriptionStatus({
        accessToken: "access-token",
        preapprovalId: "preapproval-1",
        status: "canceled" as const,
      })
    ).resolves.toBe("canceled");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval/preapproval-1",
      expect.objectContaining({
        body: JSON.stringify({
          status: "cancelled" as const,
        }),
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        method: "PUT",
      })
    );
  });

  it("links the authoritative preapproval id into the provider back URL", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        id: "preapproval-1",
        status: "pending" as const,
      }),
      ok: true,
    });

    await expect(
      updateMercadoPagoPreapprovalBackUrl({
        accessToken: "access-token",
        backUrl:
          "https://tutribu.example.com/matematica-pro?preapproval_id=preapproval-1",
        preapprovalId: "preapproval-1",
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval/preapproval-1",
      expect.objectContaining({
        body: JSON.stringify({
          back_url:
            "https://tutribu.example.com/matematica-pro?preapproval_id=preapproval-1",
        }),
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        method: "PUT",
      })
    );
  });

  it("throws when the provider rejects the back URL update", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        message: "Invalid back_url",
      }),
      ok: false,
      status: 400,
    });

    await expect(
      updateMercadoPagoPreapprovalBackUrl({
        accessToken: "access-token",
        backUrl: "https://tutribu.example.com/matematica-pro?preapproval_id=x",
        preapprovalId: "preapproval-1",
      })
    ).rejects.toThrow("Mercado Pago request failed with status 400");
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
        backUrl: "https://tutribu.example.com/matematica-pro",
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
        backUrl: "https://tutribu.example.com/matematica-pro",
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
