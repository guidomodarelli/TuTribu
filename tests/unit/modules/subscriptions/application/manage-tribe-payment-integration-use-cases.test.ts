import { vi, describe, it, expect } from "vitest";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import {
  connectTribePaymentIntegration,
  updateTribePaymentIntegrationAccountLabel,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-payment-integration-use-cases";

const PAYMENT_INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";

describe("manage tribe payment integration use cases", () => {
  it("should trim and update a Mercado Pago account label", async () => {
    const updateAccountLabel = vi.fn(async () => ({
      account: {
        accountLabel: "Cuenta principal",
        id: PAYMENT_INTEGRATION_ID,
        providerAccountEmail: null,
        providerAccountId: "collector-1",
        status: "connected" as const,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    }));
    const useCase = updateTribePaymentIntegrationAccountLabel({
      tribePaymentIntegrationRepository: {
        connect: vi.fn(),
        updateAccountLabel,
      },
    });

    const result = await useCase({
      accountLabel: " Cuenta principal ",
      paymentIntegrationId: ` ${PAYMENT_INTEGRATION_ID} `,
      tribeSlug: " matematica-pro ",
    });

    expect(result.status).toBe(TRIBE_SUBSCRIPTION_PRICE_STATUS.updated);
    expect(updateAccountLabel).toHaveBeenCalledWith({
      accountLabel: "Cuenta principal",
      paymentIntegrationId: PAYMENT_INTEGRATION_ID,
      tribeSlug: "matematica-pro",
    });
  });

  it("should reject an empty Mercado Pago account label", async () => {
    const updateAccountLabel = vi.fn();
    const useCase = updateTribePaymentIntegrationAccountLabel({
      tribePaymentIntegrationRepository: {
        connect: vi.fn(),
        updateAccountLabel,
      },
    });

    const result = await useCase({
      accountLabel: " ",
      paymentIntegrationId: PAYMENT_INTEGRATION_ID,
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });
    expect(updateAccountLabel).not.toHaveBeenCalled();
  });

  it("should reject a malformed Mercado Pago account id before updating the label", async () => {
    const updateAccountLabel = vi.fn();
    const useCase = updateTribePaymentIntegrationAccountLabel({
      tribePaymentIntegrationRepository: {
        connect: vi.fn(),
        updateAccountLabel,
      },
    });

    const result = await useCase({
      accountLabel: "Cuenta principal",
      paymentIntegrationId: "integration-1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });
    expect(updateAccountLabel).not.toHaveBeenCalled();
  });

  it("should trim nullable fields when connecting Mercado Pago", async () => {
    const connect = vi.fn(async () => ({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.connected,
    }));
    const useCase = connectTribePaymentIntegration({
      tribePaymentIntegrationRepository: {
        connect,
        updateAccountLabel: vi.fn(),
      },
    });

    await useCase({
      accessToken: " access-token ",
      expiresIn: null,
      providerAccountId: " collector-1 ",
      refreshToken: " refresh-token ",
      tribeSlug: " matematica-pro ",
    });

    expect(connect).toHaveBeenCalledWith({
      accessToken: "access-token",
      expiresIn: null,
      providerAccountId: "collector-1",
      refreshToken: "refresh-token",
      tribeSlug: "matematica-pro",
    });
  });
});
