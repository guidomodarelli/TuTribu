import {
  handleMercadoPagoSubscriptionWebhook,
  startTribeMemberSubscription,
  validatePendingTribeMemberSubscriptionReturn,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-member-subscription-use-cases";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import type { TribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-member-subscription-repository";

function createRepository(
  overrides: Partial<TribeMemberSubscriptionRepository> = {}
): TribeMemberSubscriptionRepository {
  return {
    handleWebhook: jest.fn(),
    hasPendingSubscriptionReturn: jest.fn(),
    startCurrentPriceSubscription: jest.fn(),
    ...overrides,
  };
}

describe("tribe member subscription use cases", () => {
  it("starts a subscription with the current price when a member was blocked by payment", async () => {
    const startCurrentPriceSubscription = jest.fn(async () => ({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout",
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    }));
    const execute = startTribeMemberSubscription({
      tribeMemberSubscriptionRepository: createRepository({
        startCurrentPriceSubscription,
      }),
    });

    await expect(
      execute({
        idempotencyKey: " retry-payment-1 ",
        invitationToken: " invitation-token-1 ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout",
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    });
    expect(startCurrentPriceSubscription).toHaveBeenCalledWith({
      idempotencyKey: "retry-payment-1",
      invitationToken: "invitation-token-1",
      tribeSlug: "matematica-pro",
    });
  });

  it("keeps conduct-blocked members out of the paid reentry flow", async () => {
    const startCurrentPriceSubscription = jest.fn(async () => ({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked,
    }));
    const execute = startTribeMemberSubscription({
      tribeMemberSubscriptionRepository: createRepository({
        startCurrentPriceSubscription,
      }),
    });

    await expect(
      execute({
        idempotencyKey: "conduct-blocked-retry",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked,
    });
  });

  it("processes duplicate webhooks idempotently", async () => {
    const handleWebhook = jest.fn(async () => ({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook,
    }));
    const execute = handleMercadoPagoSubscriptionWebhook({
      tribeMemberSubscriptionRepository: createRepository({ handleWebhook }),
    });

    await expect(
      execute({
        eventId: " webhook-1 ",
        resourceId: " preapproval-1 ",
        topic: " subscription_preapproval ",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.duplicateWebhook,
    });
    expect(handleWebhook).toHaveBeenCalledWith({
      eventId: "webhook-1",
      resourceId: "preapproval-1",
      topic: "subscription_preapproval",
    });
  });

  it("validates pending Mercado Pago returns against the current member subscription", async () => {
    const hasPendingSubscriptionReturn = jest.fn(async () => true);
    const execute = validatePendingTribeMemberSubscriptionReturn({
      tribeMemberSubscriptionRepository: createRepository({
        hasPendingSubscriptionReturn,
      }),
    });

    await expect(
      execute({
        providerSubscriptionId: " preapproval-1 ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toBe(true);
    expect(hasPendingSubscriptionReturn).toHaveBeenCalledWith({
      providerSubscriptionId: "preapproval-1",
      tribeSlug: "matematica-pro",
    });
  });
});
