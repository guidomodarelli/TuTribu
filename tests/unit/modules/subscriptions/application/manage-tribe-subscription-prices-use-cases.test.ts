import {
  createTribeSubscriptionPrice,
  deleteTribeSubscriptionPrice,
  listTribeSubscriptionPrices,
  makeTribeSubscriptionPriceCurrent,
} from "@/src/modules/subscriptions/application/use-cases/manage-tribe-subscription-prices-use-cases";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import type { TribeSubscriptionPriceRepository } from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";

function createRepository(
  overrides: Partial<TribeSubscriptionPriceRepository> = {}
): TribeSubscriptionPriceRepository {
  return {
    create: jest.fn(),
    delete: jest.fn(),
    listByTribeSlug: jest.fn(),
    makeCurrent: jest.fn(),
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
  };

  it("creates cheaper prices because historical versions are immutable", async () => {
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
      tribeSlug: "matematica-pro",
    });
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
      prices: [createdPrice],
      viewerPermissions: {
        canManagePrices: false,
        canViewPrices: true,
      },
    });
  });
});
