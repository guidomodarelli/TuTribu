import {
  createTribeSubscriptionPrice,
  deleteTribeSubscriptionPrice,
  listTribeSubscriptionPrices,
  makeTribeSubscriptionPriceCurrent,
  syncMercadoPagoSubscriptionProviderPlanWebhook,
  updateTribeSubscriptionPrice,
  verifyTribeSubscriptionProviderPlan,
  verifyTribeSubscriptionProviderPlans,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-subscription-prices-use-cases";
import {
  getTribeSubscriberDiagnostics,
  reconcileTribeSubscriberDiagnostics,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-subscriber-diagnostics-use-cases";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import type { TribeSubscriptionPriceRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";
import type { TribeSubscriberDiagnosticsRepository } from "@/src/modules/subscriptions/application/ports/tribe-subscriber-diagnostics-repository";

function createRepository(
  overrides: Partial<TribeSubscriptionPriceRepository> = {}
): TribeSubscriptionPriceRepository {
  return {
    create: jest.fn(),
    delete: jest.fn(),
    getUpdateTrialPolicy: jest.fn(),
    listByTribeSlug: jest.fn(),
    makeCurrent: jest.fn(),
    syncProviderPlan: jest.fn(),
    update: jest.fn(),
    verifyProviderPlan: jest.fn(),
    verifyProviderPlans: jest.fn(),
    ...overrides,
  };
}

function createSubscriberDiagnosticsRepository(
  overrides: Partial<TribeSubscriberDiagnosticsRepository> = {}
): TribeSubscriberDiagnosticsRepository {
  return {
    getSubscriberDiagnostics: jest.fn(),
    reconcileSubscriberDiagnostics: jest.fn(),
    ...overrides,
  };
}

describe("manage tribe subscription prices use cases", () => {
  const createdPrice = {
    activeSubscribersCount: 0,
    amountCents: 500000,
    createdAt: "2026-05-06T12:00:00.000Z",
    currency: "ARS" as const,
    frequency: "monthly" as const,
    id: "price-2",
    isCurrent: false,
    name: "Plan mensual",
    status: "active" as const,
    trial: {
      frequency: 7,
      frequencyType: "days" as const,
    },
  };

  it("creates cheaper prices as independent plans", async () => {
    const create = jest.fn(async () => ({
      price: createdPrice,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
    }));
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "5000",
        name: " Plan mensual ",
        trialFrequency: " 7 ",
        trialFrequencyType: " days ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      price: createdPrice,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
    });
    expect(create).toHaveBeenCalledWith({
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan mensual",
      trialFrequency: 7,
      trialFrequencyType: "days",
      tribeSlug: "matematica-pro",
    });
  });

  it("should reject invalid trial periods before calling the repository", async () => {
    const create = jest.fn();
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan mensual",
        trialFrequency: "0",
        trialFrequencyType: "days",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput });
    expect(create).not.toHaveBeenCalled();
  });

  it("should accept one-day trial periods", async () => {
    const create = jest.fn(async () => ({
      price: {
        ...createdPrice,
        trial: {
          frequency: 1,
          frequencyType: "days" as const,
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
    }));
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan mensual",
        trialFrequency: "1",
        trialFrequencyType: "days",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        trial: {
          frequency: 1,
          frequencyType: "days",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        trialFrequency: 1,
        trialFrequencyType: "days",
      })
    );
  });

  it("should accept two-day trial periods", async () => {
    const create = jest.fn(async () => ({
      price: {
        ...createdPrice,
        trial: {
          frequency: 2,
          frequencyType: "days" as const,
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
    }));
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan mensual",
        trialFrequency: "2",
        trialFrequencyType: "days",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        trial: {
          frequency: 2,
          frequencyType: "days",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        trialFrequency: 2,
        trialFrequencyType: "days",
      })
    );
  });

  it("should reject trial periods greater than fourteen days before calling the repository", async () => {
    const create = jest.fn();
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan mensual",
        trialFrequency: "15",
        trialFrequencyType: "days",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects invalid amounts before calling the repository", async () => {
    const create = jest.fn();
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "0",
        name: "Plan mensual",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects amounts lower than the Mercado Pago minimum before calling the repository", async () => {
    const create = jest.fn();
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "14.99",
        name: "Plan mensual",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects amounts that do not fit in the persisted cents column", async () => {
    const create = jest.fn();
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "21474836.48",
        name: "Plan mensual",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput });
    expect(create).not.toHaveBeenCalled();
  });

  it("passes repository limit responses when a tribe already has thirty prices", async () => {
    const create = jest.fn(async () => ({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached,
    }));
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "2500",
        name: "Plan nuevo",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached });
  });

  it("marks one price as current without changing existing member subscriptions", async () => {
    const makeCurrent = jest.fn(async () => ({
      price: {
        ...createdPrice,
        isCurrent: true,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
    }));
    const execute = makeTribeSubscriptionPriceCurrent({
      tribeSubscriptionPriceRepository: createRepository({ makeCurrent }),
    });

    await expect(
      execute({
        priceId: " price-2 ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toMatchObject({
      price: {
        id: "price-2",
        isCurrent: true,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
    });
    expect(makeCurrent).toHaveBeenCalledWith({
      priceId: "price-2",
      tribeSlug: "matematica-pro",
    });
  });

  it("does not delete a price with associated members or active subscribers", async () => {
    const deletePrice = jest.fn(async () => ({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers,
    }));
    const execute = deleteTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ delete: deletePrice }),
    });

    await expect(
      execute({
        priceId: " price-1 ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers });
    expect(deletePrice).toHaveBeenCalledWith({
      priceId: "price-1",
      tribeSlug: "matematica-pro",
    });
  });

  it("lists prices with viewer permissions from the repository", async () => {
    const listByTribeSlug = jest.fn(async () => ({
      hasMercadoPagoIntegration: true,
      mercadoPagoConnectionStatus: "connected" as const,
      prices: [createdPrice],
      viewerPermissions: {
        canManagePrices: false,
        canViewPrices: true,
      },
    }));
    const execute = listTribeSubscriptionPrices({
      tribeSubscriptionPriceRepository: createRepository({ listByTribeSlug }),
    });

    await expect(
      execute({
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      hasMercadoPagoIntegration: true,
      mercadoPagoConnectionStatus: "connected",
      prices: [createdPrice],
      viewerPermissions: {
        canManagePrices: false,
        canViewPrices: true,
      },
    });
  });

  it("should update one price with normalized mixed-policy input", async () => {
    const update = jest.fn(async () => ({
      price: {
        ...createdPrice,
        name: "Plan actualizado",
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    }));
    const execute = updateTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ update }),
    });

    await expect(
      execute({
        amount: "5000",
        name: " Plan actualizado ",
        priceId: " price-1 ",
        trialFrequency: "14",
        trialFrequencyType: "days",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toMatchObject({
      price: {
        name: "Plan actualizado",
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });
    expect(update).toHaveBeenCalledWith({
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan actualizado",
      priceId: "price-1",
      trialFrequency: 14,
      trialFrequencyType: "days",
      tribeSlug: "matematica-pro",
    });
  });

  it("should allow preserving existing synchronized day trials greater than fourteen days when updating", async () => {
    const getUpdateTrialPolicy = jest.fn(async () => ({
      amountCents: 500000,
      hasMercadoPagoPreapprovalPlan: true,
      trialFrequency: 21,
      trialFrequencyType: "days" as const,
    }));
    const update = jest.fn(async () => ({
      price: {
        ...createdPrice,
        name: "Plan actualizado",
        trial: {
          frequency: 21,
          frequencyType: "days" as const,
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    }));
    const execute = updateTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({
        getUpdateTrialPolicy,
        update,
      }),
    });

    await expect(
      execute({
        amount: "5000",
        name: " Plan actualizado ",
        priceId: " price-1 ",
        trialFrequency: "21",
        trialFrequencyType: "days",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toMatchObject({
      price: {
        trial: {
          frequency: 21,
          frequencyType: "days",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });
    expect(update).toHaveBeenCalledWith({
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan actualizado",
      priceId: "price-1",
      trialFrequency: 21,
      trialFrequencyType: "days",
      tribeSlug: "matematica-pro",
    });
  });

  it("should allow preserving existing synchronized day trials greater than fourteen days when the amount changes", async () => {
    const getUpdateTrialPolicy = jest.fn(async () => ({
      amountCents: 400000,
      hasMercadoPagoPreapprovalPlan: true,
      trialFrequency: 21,
      trialFrequencyType: "days" as const,
    }));
    const update = jest.fn(async () => ({
      price: {
        ...createdPrice,
        amountCents: 500000,
        trial: {
          frequency: 21,
          frequencyType: "days" as const,
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    }));
    const execute = updateTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({
        getUpdateTrialPolicy,
        update,
      }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan actualizado",
        priceId: "price-1",
        trialFrequency: "21",
        trialFrequencyType: "days",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        amountCents: 500000,
        trial: {
          frequency: 21,
          frequencyType: "days",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });
    expect(getUpdateTrialPolicy).toHaveBeenCalledWith({
      priceId: "price-1",
      tribeSlug: "matematica-pro",
    });
    expect(update).toHaveBeenCalledWith({
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan actualizado",
      priceId: "price-1",
      trialFrequency: 21,
      trialFrequencyType: "days",
      tribeSlug: "matematica-pro",
    });
  });

  it("should reject new day trial values greater than fourteen days before updating", async () => {
    const getUpdateTrialPolicy = jest.fn(async () => ({
      amountCents: 500000,
      hasMercadoPagoPreapprovalPlan: true,
      trialFrequency: 21,
      trialFrequencyType: "days" as const,
    }));
    const update = jest.fn();
    const execute = updateTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({
        getUpdateTrialPolicy,
        update,
      }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan actualizado",
        priceId: "price-1",
        trialFrequency: "22",
        trialFrequencyType: "days",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput });
    expect(getUpdateTrialPolicy).toHaveBeenCalledWith({
      priceId: "price-1",
      tribeSlug: "matematica-pro",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("should preserve repository access status when validating extended day trials without a policy", async () => {
    const getUpdateTrialPolicy = jest.fn(async () => null);
    const update = jest.fn(async () => ({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
    }));
    const execute = updateTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({
        getUpdateTrialPolicy,
        update,
      }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan actualizado",
        priceId: "price-1",
        trialFrequency: "21",
        trialFrequencyType: "days",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden });
    expect(getUpdateTrialPolicy).toHaveBeenCalledWith({
      priceId: "price-1",
      tribeSlug: "matematica-pro",
    });
    expect(update).toHaveBeenCalledWith({
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan actualizado",
      priceId: "price-1",
      trialFrequency: 21,
      trialFrequencyType: "days",
      tribeSlug: "matematica-pro",
    });
  });

  it("should preserve omitted trial fields when updating legacy clients", async () => {
    const update = jest.fn(async () => ({
      price: createdPrice,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    }));
    const execute = updateTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ update }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan actualizado",
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });
    expect(update).toHaveBeenCalledWith({
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan actualizado",
      priceId: "price-1",
      tribeSlug: "matematica-pro",
    });
  });

  it("should clear trial fields when updating with an empty trial frequency", async () => {
    const update = jest.fn(async () => ({
      price: {
        ...createdPrice,
        trial: null,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    }));
    const execute = updateTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ update }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan actualizado",
        priceId: "price-1",
        trialFrequency: "",
        trialFrequencyType: "days",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        trial: null,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });
    expect(update).toHaveBeenCalledWith({
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan actualizado",
      priceId: "price-1",
      trialFrequency: null,
      trialFrequencyType: null,
      tribeSlug: "matematica-pro",
    });
  });

  it("should reject invalid update amounts before calling the repository", async () => {
    const update = jest.fn();
    const execute = updateTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ update }),
    });

    await expect(
      execute({
        amount: "10",
        name: "Plan actualizado",
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput });
    expect(update).not.toHaveBeenCalled();
  });

  it("should verify provider plans for a tribe with normalized input", async () => {
    const verifyProviderPlans = jest.fn(async () => ({
      canceledPriceIds: [],
      prices: [createdPrice],
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    }));
    const execute = verifyTribeSubscriptionProviderPlans({
      tribeSubscriptionPriceRepository: createRepository({ verifyProviderPlans }),
    });

    await expect(
      execute({
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      canceledPriceIds: [],
      prices: [createdPrice],
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    });
    expect(verifyProviderPlans).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("should verify one provider plan with normalized input", async () => {
    const verifyProviderPlan = jest.fn(async () => ({
      price: createdPrice,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    }));
    const execute = verifyTribeSubscriptionProviderPlan({
      tribeSubscriptionPriceRepository: createRepository({ verifyProviderPlan }),
    });

    await expect(
      execute({
        priceId: " price-1 ",
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      price: createdPrice,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
    expect(verifyProviderPlan).toHaveBeenCalledWith({
      priceId: "price-1",
      tribeSlug: "matematica-pro",
    });
  });

  it("should sync provider plan webhooks with normalized input", async () => {
    const syncProviderPlan = jest.fn(async () => ({
      price: createdPrice,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    }));
    const execute = syncMercadoPagoSubscriptionProviderPlanWebhook({
      tribeSubscriptionPriceRepository: createRepository({ syncProviderPlan }),
    });

    await expect(
      execute({
        eventId: " event-1 ",
        resourceId: " plan-1 ",
        topic: " subscription_preapproval_plan.updated ",
      })
    ).resolves.toEqual({
      price: createdPrice,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
    expect(syncProviderPlan).toHaveBeenCalledWith({
      eventId: "event-1",
      resourceId: "plan-1",
      topic: "subscription_preapproval_plan.updated",
    });
  });

  it("should read subscriber diagnostics with normalized input", async () => {
    const diagnostics = {
      lastReconciledAt: "2026-05-12T01:00:00.000Z",
      localActiveSubscribersCount: 4,
      mercadoPagoAuthorizedSubscribersCount: 4,
      mercadoPagoCanceledOrMissingSubscribersCount: 1,
      mercadoPagoPausedSubscribersCount: 2,
      mercadoPagoPendingSubscribersCount: 3,
    };
    const getSubscriberDiagnostics = jest.fn(async () => diagnostics);
    const execute = getTribeSubscriberDiagnostics({
      tribeSubscriberDiagnosticsRepository:
        createSubscriberDiagnosticsRepository({ getSubscriberDiagnostics }),
    });

    await expect(
      execute({
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual(diagnostics);
    expect(getSubscriberDiagnostics).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("should reconcile subscriber diagnostics with normalized input", async () => {
    const diagnostics = {
      localActiveSubscribersCount: 1,
      mercadoPagoAuthorizedSubscribersCount: 1,
      mercadoPagoCanceledOrMissingSubscribersCount: 0,
      mercadoPagoPausedSubscribersCount: 0,
      mercadoPagoPendingSubscribersCount: 0,
    };
    const reconcileSubscriberDiagnostics = jest.fn(async () => ({
      diagnostics,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    }));
    const execute = reconcileTribeSubscriberDiagnostics({
      tribeSubscriberDiagnosticsRepository:
        createSubscriberDiagnosticsRepository({
          reconcileSubscriberDiagnostics,
        }),
    });

    await expect(
      execute({
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      diagnostics,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    });
    expect(reconcileSubscriberDiagnostics).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });
});
