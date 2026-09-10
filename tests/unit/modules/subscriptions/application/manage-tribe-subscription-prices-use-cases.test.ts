import { vi, describe, it, expect } from "vitest";
import {
  createTribeSubscriptionPrice,
  deleteTribeSubscriptionPrice,
  getTribeCurrentSubscriptionOffer,
  listTribeSubscriptionPrices,
  makeTribeSubscriptionPriceCurrent,
  syncMercadoPagoSubscriptionProviderPlanWebhook,
  updateTribeSubscriptionPrice,
  verifyTribeSubscriptionProviderPlan,
  verifyTribeSubscriptionProviderPlans,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-subscription-prices-use-cases";
import { TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import {
  getTribeSubscriberDiagnostics,
  reconcileTribeSubscriberDiagnostics,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-subscriber-diagnostics-use-cases";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import type { TribeSubscriptionPriceRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";
import type { TribeSubscriberDiagnosticsRepository } from "@/src/modules/subscriptions/application/ports/tribe-subscriber-diagnostics-repository";

const PAYMENT_INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";

function createRepository(
  overrides: Partial<TribeSubscriptionPriceRepository> = {}
): TribeSubscriptionPriceRepository {
  return { deleteWithInvitationActions: vi.fn(), setFreeJoinAsCurrent: vi.fn(), setOpenFreeJoin: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    getCurrentSubscriptionOffer: vi.fn(),
    getUpdateTrialPolicy: vi.fn(),
    listByTribeSlug: vi.fn(),
    makeCurrent: vi.fn(),
    syncProviderPlan: vi.fn(),
    update: vi.fn(),
    verifyProviderPlan: vi.fn(),
    verifyProviderPlans: vi.fn(),
    ...overrides,
  };
}

function createSubscriberDiagnosticsRepository(
  overrides: Partial<TribeSubscriberDiagnosticsRepository> = {}
): TribeSubscriberDiagnosticsRepository {
  return {
    getSubscriberDiagnostics: vi.fn(),
    reconcileSubscriberDiagnostics: vi.fn(),
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
    mercadoPagoAccountLabel: "Cuenta principal",
    mercadoPagoAccountEmail: "leader@example.com",
    name: "Plan mensual",
    paymentIntegrationId: PAYMENT_INTEGRATION_ID,
    providerAccountId: "collector-1",
    status: "active" as const,
    trial: {
      frequency: 7,
      frequencyType: "days" as const,
    },
  };

  it("creates cheaper prices as independent plans", async () => {
    const create = vi.fn(async () => ({
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
        paymentIntegrationId: ` ${PAYMENT_INTEGRATION_ID} `,
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
      paymentIntegrationId: PAYMENT_INTEGRATION_ID,
      trialFrequency: 7,
      trialFrequencyType: "days",
      tribeSlug: "matematica-pro",
    });
  });

  it("should reject price creation without a selected Mercado Pago account", async () => {
    const create = vi.fn();
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan mensual",
        paymentIntegrationId: " ",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput });
    expect(create).not.toHaveBeenCalled();
  });

  it("should reject price creation with a malformed Mercado Pago account id", async () => {
    const create = vi.fn();
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "5000",
        name: "Plan mensual",
        paymentIntegrationId: "integration-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput });
    expect(create).not.toHaveBeenCalled();
  });

  it("should reject invalid trial periods before calling the repository", async () => {
    const create = vi.fn();
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
    const create = vi.fn(async () => ({
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
        paymentIntegrationId: PAYMENT_INTEGRATION_ID,
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
    const create = vi.fn(async () => ({
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
        paymentIntegrationId: PAYMENT_INTEGRATION_ID,
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
    const create = vi.fn();
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
    const create = vi.fn();
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
    const create = vi.fn();
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
    const create = vi.fn();
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
    const create = vi.fn(async () => ({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached,
    }));
    const execute = createTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ create }),
    });

    await expect(
      execute({
        amount: "2500",
        name: "Plan nuevo",
        paymentIntegrationId: PAYMENT_INTEGRATION_ID,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached });
  });

  it("marks one price as current without changing existing member subscriptions", async () => {
    const makeCurrent = vi.fn(async () => ({
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
    const deletePrice = vi.fn(async () => ({
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
    const listByTribeSlug = vi.fn(async () => ({ freeJoinIsCurrent: false, openFreeJoinEnabled: false,
      availableMercadoPagoAccounts: [
        {
          accountLabel: "Cuenta principal",
          id: PAYMENT_INTEGRATION_ID,
          providerAccountId: "collector-1",
          providerAccountEmail: "leader@example.com",
          status: "connected" as const,
        },
        {
          accountLabel: "Cuenta secundaria",
          id: "integration-2",
          providerAccountId: "collector-2",
          providerAccountEmail: null,
          status: "requires_reconnection" as const,
        },
      ],
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
    ).resolves.toEqual({ freeJoinIsCurrent: false, openFreeJoinEnabled: false,
      availableMercadoPagoAccounts: [
        {
          accountLabel: "Cuenta principal",
          id: PAYMENT_INTEGRATION_ID,
          providerAccountId: "collector-1",
          providerAccountEmail: "leader@example.com",
          status: "connected" as const,
        },
        {
          accountLabel: "Cuenta secundaria",
          id: "integration-2",
          providerAccountId: "collector-2",
          providerAccountEmail: null,
          status: "requires_reconnection" as const,
        },
      ],
      hasMercadoPagoIntegration: true,
      mercadoPagoConnectionStatus: "connected",
      prices: [createdPrice],
      viewerPermissions: {
        canManagePrices: false,
        canViewPrices: true,
      },
    });
  });

  it("returns the current paid offer for a tokenless public join with normalized slug", async () => {
    const getCurrentSubscriptionOffer = vi.fn(async () => ({
      price: {
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.available,
    }));
    const execute = getTribeCurrentSubscriptionOffer({
      tribeSubscriptionPriceRepository: createRepository({
        getCurrentSubscriptionOffer,
      }),
    });

    await expect(
      execute({
        tribeSlug: " matematica-pro ",
      })
    ).resolves.toEqual({
      price: {
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.available,
    });
    expect(getCurrentSubscriptionOffer).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("lowercases a mixed-case slug before reading the open-join offer", async () => {
    const getCurrentSubscriptionOffer = vi.fn(async () => ({
      price: {
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.available,
    }));
    const execute = getTribeCurrentSubscriptionOffer({
      tribeSubscriptionPriceRepository: createRepository({
        getCurrentSubscriptionOffer,
      }),
    });

    await execute({
      tribeSlug: " Matematica-Pro ",
    });

    expect(getCurrentSubscriptionOffer).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("returns an unavailable offer when the tribe has no current paid plan", async () => {
    const getCurrentSubscriptionOffer = vi.fn(async () => ({
      status: TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.unavailable,
    }));
    const execute = getTribeCurrentSubscriptionOffer({
      tribeSubscriptionPriceRepository: createRepository({
        getCurrentSubscriptionOffer,
      }),
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.unavailable,
    });
  });

  it("should update one price with normalized mixed-policy input", async () => {
    const update = vi.fn(async () => ({
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
    const getUpdateTrialPolicy = vi.fn(async () => ({
      amountCents: 500000,
      hasMercadoPagoPreapprovalPlan: true,
      trialFrequency: 21,
      trialFrequencyType: "days" as const,
    }));
    const update = vi.fn(async () => ({
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
      tribeSubscriptionPriceRepository: createRepository({ deleteWithInvitationActions: vi.fn(), setFreeJoinAsCurrent: vi.fn(), setOpenFreeJoin: vi.fn(),
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
    const getUpdateTrialPolicy = vi.fn(async () => ({
      amountCents: 400000,
      hasMercadoPagoPreapprovalPlan: true,
      trialFrequency: 21,
      trialFrequencyType: "days" as const,
    }));
    const update = vi.fn(async () => ({
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
      tribeSubscriptionPriceRepository: createRepository({ deleteWithInvitationActions: vi.fn(), setFreeJoinAsCurrent: vi.fn(), setOpenFreeJoin: vi.fn(),
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
    const getUpdateTrialPolicy = vi.fn(async () => ({
      amountCents: 500000,
      hasMercadoPagoPreapprovalPlan: true,
      trialFrequency: 21,
      trialFrequencyType: "days" as const,
    }));
    const update = vi.fn();
    const execute = updateTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ deleteWithInvitationActions: vi.fn(), setFreeJoinAsCurrent: vi.fn(), setOpenFreeJoin: vi.fn(),
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
    const getUpdateTrialPolicy = vi.fn(async () => null);
    const update = vi.fn(async () => ({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
    }));
    const execute = updateTribeSubscriptionPrice({
      tribeSubscriptionPriceRepository: createRepository({ deleteWithInvitationActions: vi.fn(), setFreeJoinAsCurrent: vi.fn(), setOpenFreeJoin: vi.fn(),
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
    const update = vi.fn(async () => ({
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
    const update = vi.fn(async () => ({
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
    const update = vi.fn();
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
    const verifyProviderPlans = vi.fn(async () => ({ freeJoinIsCurrent: false,
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
    ).resolves.toEqual({ freeJoinIsCurrent: false,
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
    const verifyProviderPlan = vi.fn(async () => ({
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
    const syncProviderPlan = vi.fn(async () => ({
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
    const getSubscriberDiagnostics = vi.fn(async () => diagnostics);
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
    const reconcileSubscriberDiagnostics = vi.fn(async () => ({
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
