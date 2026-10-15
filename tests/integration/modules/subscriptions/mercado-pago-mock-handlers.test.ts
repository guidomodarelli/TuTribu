// @vitest-environment node
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createMercadoPagoPendingPreapprovalSubscription,
  createMercadoPagoPreapprovalPlan,
  exchangeMercadoPagoAuthorizationCode,
  findMercadoPagoSubscriptionCheckoutByReference,
  getMercadoPagoPayment,
  getMercadoPagoPreapprovalDetails,
  getMercadoPagoPreapprovalPlan,
  getMercadoPagoPreapprovalStatus,
  refreshMercadoPagoAccessToken,
  searchMercadoPagoAuthorizedPayments,
  searchMercadoPagoPreapprovalPlans,
  updateMercadoPagoPreapprovalPlan,
  updateMercadoPagoPreapprovalSubscriptionStatus,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import {
  createMercadoPagoMockHandlers,
  resolveMercadoPagoMockOptions,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/dev-mocks/mercado-pago-mock-handlers";

const ACCESS_TOKEN = "mock-seller-access-token";
const TRIBE_RETURN_URL = "https://dev.tutribu.app/mi-tribu";

describe("Mercado Pago development mock handlers", () => {
  const server = setupServer();
  const previousEnvironment = {
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    MERCADO_PAGO_CLIENT_ID: process.env.MERCADO_PAGO_CLIENT_ID,
    MERCADO_PAGO_CLIENT_SECRET: process.env.MERCADO_PAGO_CLIENT_SECRET,
  };

  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" });
  });

  beforeEach(() => {
    process.env.BETTER_AUTH_URL = "https://dev.tutribu.app";
    process.env.MERCADO_PAGO_CLIENT_ID = "mock-client-id";
    process.env.MERCADO_PAGO_CLIENT_SECRET = "mock-client-secret";
    server.resetHandlers(...createMercadoPagoMockHandlers());
  });

  afterEach(() => {
    Object.assign(process.env, previousEnvironment);
  });

  afterAll(() => {
    server.close();
  });

  it("connects a seller account through the OAuth code exchange and refresh", async () => {
    const connection = await exchangeMercadoPagoAuthorizationCode("mock-code");

    expect(connection.accessToken).toEqual(expect.any(String));
    expect(connection.refreshToken).toEqual(expect.any(String));
    expect(connection.providerAccountId).toEqual(expect.any(String));
    expect(connection.expiresIn).toBeGreaterThan(0);

    const refreshedConnection = await refreshMercadoPagoAccessToken(
      connection.refreshToken ?? ""
    );

    expect(refreshedConnection.accessToken).not.toBe(connection.accessToken);
    expect(refreshedConnection.providerAccountId).toBe(
      connection.providerAccountId
    );
  });

  it("creates, reads, searches and updates a subscription price plan", async () => {
    const planId = await createMercadoPagoPreapprovalPlan({
      accessToken: ACCESS_TOKEN,
      amountCents: 1_500_00,
      backUrl: TRIBE_RETURN_URL,
      currency: "ARS",
      externalReference: "price-1",
      idempotencyKey: "plan-key",
      name: "Plan mensual",
      reason: "Suscripción a Mi Tribu",
      trialFrequency: 7,
      trialFrequencyType: "days",
    });

    await expect(
      getMercadoPagoPreapprovalPlan({
        accessToken: ACCESS_TOKEN,
        preapprovalPlanId: planId,
      })
    ).resolves.toEqual({
      amountCents: 1_500_00,
      currency: "ARS",
      externalReference: "price-1",
      id: planId,
      reason: "Suscripción a Mi Tribu",
      status: "active",
      trial: { frequency: 7, frequencyType: "days" },
    });

    const updatedPlan = await updateMercadoPagoPreapprovalPlan({
      accessToken: ACCESS_TOKEN,
      amountCents: 2_000_00,
      backUrl: TRIBE_RETURN_URL,
      currency: "ARS",
      externalReference: "price-1",
      frequency: "monthly",
      preapprovalPlanId: planId,
      reason: "Suscripción a Mi Tribu",
      status: "cancelled",
    });

    expect(updatedPlan).toMatchObject({
      amountCents: 2_000_00,
      status: "cancelled",
      trial: null,
    });
    await expect(
      searchMercadoPagoPreapprovalPlans({
        accessToken: ACCESS_TOKEN,
        externalReference: "price-1",
      })
    ).resolves.toEqual([updatedPlan]);
  });

  it("returns the member to the tribe as if the hosted checkout was approved", async () => {
    const checkout = await createMercadoPagoPendingPreapprovalSubscription({
      accessToken: ACCESS_TOKEN,
      amountCents: 1_500_00,
      backUrl: TRIBE_RETURN_URL,
      currency: "ARS",
      externalReference: "reservation-1",
      idempotencyKey: "reservation-1",
      payerEmail: "miembro@example.com",
      reason: "Suscripción a Mi Tribu",
    });
    const checkoutUrl = new URL(checkout.checkoutUrl);

    expect(checkoutUrl.origin + checkoutUrl.pathname).toBe(TRIBE_RETURN_URL);
    expect(checkoutUrl.searchParams.get("preapproval_id")).toBe(
      checkout.providerSubscriptionId
    );
    await expect(
      getMercadoPagoPreapprovalDetails({
        accessToken: ACCESS_TOKEN,
        preapprovalId: checkout.providerSubscriptionId,
      })
    ).resolves.toEqual({
      externalReference: "reservation-1",
      id: checkout.providerSubscriptionId,
      preapprovalPlanId: null,
      status: "authorized",
    });
  });

  it("keeps an abandoned checkout pending and recoverable by its reservation", async () => {
    server.resetHandlers(
      ...createMercadoPagoMockHandlers({ checkoutStatus: "pending" })
    );
    const checkout = await createMercadoPagoPendingPreapprovalSubscription({
      accessToken: ACCESS_TOKEN,
      amountCents: 1_500_00,
      backUrl: TRIBE_RETURN_URL,
      currency: "ARS",
      externalReference: "reservation-4",
      idempotencyKey: "reservation-4",
      payerEmail: "miembro@example.com",
      reason: "Suscripción a Mi Tribu",
    });

    await expect(
      findMercadoPagoSubscriptionCheckoutByReference({
        accessToken: ACCESS_TOKEN,
        externalReference: "reservation-4",
      })
    ).resolves.toEqual(checkout);
    await expect(
      getMercadoPagoPreapprovalStatus({
        accessToken: ACCESS_TOKEN,
        preapprovalId: checkout.providerSubscriptionId,
      })
    ).resolves.toBe("pending");
  });

  it("lets the developer pick the abandoned checkout outcome from the environment", async () => {
    server.resetHandlers(
      ...createMercadoPagoMockHandlers(
        resolveMercadoPagoMockOptions({ MOCK_MERCADO_PAGO_CHECKOUT_STATUS: "Pending" })
      )
    );
    const checkout = await createMercadoPagoPendingPreapprovalSubscription({
      accessToken: ACCESS_TOKEN,
      amountCents: 1_500_00,
      backUrl: TRIBE_RETURN_URL,
      currency: "ARS",
      externalReference: "reservation-5",
      idempotencyKey: "reservation-5",
      payerEmail: "miembro@example.com",
      reason: "Suscripción a Mi Tribu",
    });

    await expect(
      getMercadoPagoPreapprovalStatus({
        accessToken: ACCESS_TOKEN,
        preapprovalId: checkout.providerSubscriptionId,
      })
    ).resolves.toBe("pending");
  });

  it("reuses the same checkout when the creation is retried with the same idempotency key", async () => {
    const checkoutInput = {
      accessToken: ACCESS_TOKEN,
      amountCents: 1_500_00,
      backUrl: TRIBE_RETURN_URL,
      currency: "ARS",
      externalReference: "reservation-2",
      idempotencyKey: "reservation-2",
      payerEmail: "miembro@example.com",
      reason: "Suscripción a Mi Tribu",
    };

    const firstCheckout =
      await createMercadoPagoPendingPreapprovalSubscription(checkoutInput);
    const retriedCheckout =
      await createMercadoPagoPendingPreapprovalSubscription(checkoutInput);

    expect(retriedCheckout).toEqual(firstCheckout);
  });

  it("cancels a member subscription", async () => {
    const checkout = await createMercadoPagoPendingPreapprovalSubscription({
      accessToken: ACCESS_TOKEN,
      amountCents: 1_500_00,
      backUrl: TRIBE_RETURN_URL,
      currency: "ARS",
      externalReference: "reservation-3",
      idempotencyKey: "reservation-3",
      payerEmail: "miembro@example.com",
      reason: "Suscripción a Mi Tribu",
    });

    await expect(
      updateMercadoPagoPreapprovalSubscriptionStatus({
        accessToken: ACCESS_TOKEN,
        preapprovalId: checkout.providerSubscriptionId,
        status: "canceled",
      })
    ).resolves.toBe("cancelled");
    await expect(
      getMercadoPagoPreapprovalStatus({
        accessToken: ACCESS_TOKEN,
        preapprovalId: checkout.providerSubscriptionId,
      })
    ).resolves.toBe("cancelled");
  });

  it("reports unknown provider resources as missing", async () => {
    await expect(
      getMercadoPagoPreapprovalStatus({
        accessToken: ACCESS_TOKEN,
        preapprovalId: "missing-preapproval",
      })
    ).resolves.toBeNull();
    await expect(
      getMercadoPagoPreapprovalPlan({
        accessToken: ACCESS_TOKEN,
        preapprovalPlanId: "missing-plan",
      })
    ).resolves.toBeNull();
    await expect(
      getMercadoPagoPayment({ accessToken: ACCESS_TOKEN, paymentId: "123" })
    ).resolves.toBeNull();
  });

  it("returns an empty invoice history for a new subscription", async () => {
    await expect(
      searchMercadoPagoAuthorizedPayments({
        accessToken: ACCESS_TOKEN,
        preapprovalId: "any-preapproval",
      })
    ).resolves.toEqual([]);
  });
});
