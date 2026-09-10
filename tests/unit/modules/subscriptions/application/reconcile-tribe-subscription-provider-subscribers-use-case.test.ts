import { vi, describe, it, expect } from "vitest";
import { reconcileTribeSubscriptionProviderSubscribers } from "@/src/modules/subscriptions/application/use-cases/reconcile-tribe-subscription-provider-subscribers-use-case";
import {
  TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import type { TribeProviderSubscriberReconciliationRepository } from "@/src/modules/subscriptions/application/ports/tribe-provider-subscriber-reconciliation-repository";

function createRepository(
  overrides: Partial<TribeProviderSubscriberReconciliationRepository> = {}
): TribeProviderSubscriberReconciliationRepository {
  return {
    reconcileProviderSubscribers: vi.fn(),
    ...overrides,
  };
}

describe("reconcile tribe subscription provider subscribers use case", () => {
  const reconciledPrice = { trial: null,
    activeSubscribersCount: 1,
    amountCents: 500000,
    createdAt: "2026-05-06T12:00:00.000Z",
    currency: "ARS" as const,
    frequency: "monthly" as const,
    id: "price-1",
    isCurrent: true,
    name: "Plan mensual",
    status: "active" as const,
  };

  it.each(Object.values(TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE))(
    "should reconcile provider subscribers from the %s trigger with normalized input",
    async (source) => {
      const reconcileProviderSubscribers = vi.fn(async () => ({
        price: reconciledPrice,
        providerActiveSubscribersCount: 1,
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
        verifiedCount: 2,
      }));
      const execute = reconcileTribeSubscriptionProviderSubscribers({
        tribeProviderSubscriberReconciliationRepository: createRepository({
          reconcileProviderSubscribers,
        }),
      });

      await expect(
        execute({
          priceId: " price-1 ",
          source,
          tribeSlug: " matematica-pro ",
        })
      ).resolves.toEqual({
        price: reconciledPrice,
        providerActiveSubscribersCount: 1,
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
        verifiedCount: 2,
      });
      expect(reconcileProviderSubscribers).toHaveBeenCalledWith({
        priceId: "price-1",
        source,
        tribeSlug: "matematica-pro",
      });
    }
  );
});
