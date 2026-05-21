import {
  cancelOwnTribeMemberSubscription,
  handleMercadoPagoSubscriptionWebhook,
  reconcileCurrentTribeMemberSubscription,
  resolveTribeMemberSubscriptionReturn,
  resolveTribeMemberSubscriptionReturnPath,
  retryTribeMemberSubscriptionPayment,
  startTribeMemberSubscription,
  validatePendingTribeMemberSubscriptionReturn,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-member-subscription-use-cases";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import type { TribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-member-subscription-repository";

function createRepository(
  overrides: Partial<TribeMemberSubscriptionRepository> = {}
): TribeMemberSubscriptionRepository {
  return {
    cancelOwnSubscription: jest.fn(),
    handleWebhook: jest.fn(),
    hasPendingSubscriptionReturn: jest.fn(),
    reconcileCurrentMemberSubscription: jest.fn(),
    resolveReturnPathByProviderSubscription: jest.fn(),
    resolveSubscriptionReturn: jest.fn(),
    retryCurrentPriceSubscriptionPayment: jest.fn(),
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

  it("forwards alreadySubscribed unchanged when the member already has a live subscription", async () => {
    const startCurrentPriceSubscription = jest.fn(async () => ({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.alreadySubscribed,
    }));
    const execute = startTribeMemberSubscription({
      tribeMemberSubscriptionRepository: createRepository({
        startCurrentPriceSubscription,
      }),
    });

    await expect(
      execute({
        idempotencyKey: "already-subscribed-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.alreadySubscribed,
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

  it("resolves a Mercado Pago return without making the return the access source", async () => {
    const resolveSubscriptionReturn = jest.fn(async () => ({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    }));
    const execute = resolveTribeMemberSubscriptionReturn({
      tribeMemberSubscriptionRepository: createRepository({
        resolveSubscriptionReturn,
      }),
    });

    await expect(
      execute({
        providerSubscriptionId: " preapproval-1 ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    });
    expect(resolveSubscriptionReturn).toHaveBeenCalledWith({
      providerSubscriptionId: "preapproval-1",
      tribeSlug: "matematica-pro",
    });
  });

  it("retries a current-price subscription payment with normalized input", async () => {
    const retryCurrentPriceSubscriptionPayment = jest.fn(async () => ({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout",
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    }));
    const execute = retryTribeMemberSubscriptionPayment({
      tribeMemberSubscriptionRepository: createRepository({
        retryCurrentPriceSubscriptionPayment,
      }),
    });

    await expect(
      execute({
        idempotencyKey: " retry-payment-1 ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout",
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    });
    expect(retryCurrentPriceSubscriptionPayment).toHaveBeenCalledWith({
      idempotencyKey: "retry-payment-1",
      tribeSlug: "matematica-pro",
    });
  });

  it("resolves Mercado Pago returns from the home page to the owning tribe", async () => {
    const resolveReturnPathByProviderSubscription = jest.fn(
      async () => "/tribu/matematica-pro?preapproval_id=preapproval-1"
    );
    const execute = resolveTribeMemberSubscriptionReturnPath({
      tribeMemberSubscriptionRepository: createRepository({
        resolveReturnPathByProviderSubscription,
      }),
    });

    await expect(
      execute({
        providerSubscriptionId: " preapproval-1 ",
      })
    ).resolves.toBe("/tribu/matematica-pro?preapproval_id=preapproval-1");
    expect(resolveReturnPathByProviderSubscription).toHaveBeenCalledWith({
      providerSubscriptionId: "preapproval-1",
    });
  });

  it("reconciles current member access before the tribe page is granted", async () => {
    const reconcileCurrentMemberSubscription = jest.fn(async () => ({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
    }));
    const execute = reconcileCurrentTribeMemberSubscription({
      tribeMemberSubscriptionRepository: createRepository({
        reconcileCurrentMemberSubscription,
      }),
    });

    await expect(
      execute({
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
    });
    expect(reconcileCurrentMemberSubscription).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("cancels the current member subscription with normalized input", async () => {
    const cancelOwnSubscription = jest.fn(async () => ({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
    }));
    const execute = cancelOwnTribeMemberSubscription({
      tribeMemberSubscriptionRepository: createRepository({
        cancelOwnSubscription,
      }),
    });

    await expect(
      execute({
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
    });
    expect(cancelOwnSubscription).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });
});
