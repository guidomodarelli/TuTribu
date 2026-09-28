import { describe, expect, it, vi } from "vitest";

import { startAcademySubscription } from "@/src/modules/subscriptions/application/use-cases/manage-academy-subscription-use-cases";
import type { AcademySubscriptionRepository } from "@/src/modules/subscriptions/domain/repositories/academy-subscription-repository";

function buildRepository(
  overrides: Partial<AcademySubscriptionRepository> = {}
): AcademySubscriptionRepository {
  return {
    cancelOwnRenewal: vi.fn(),
    getOwnRenewalStatus: vi.fn(),
    handleAuthorizedPaymentWebhook: vi.fn(),
    reconcileOwnCoverage: vi.fn(),
    reconcileSubscriptionCoverage: vi.fn(),
    startCheckout: vi.fn(async () => ({ status: "sales_closed" as const })),
    ...overrides,
  };
}

describe("startAcademySubscription", () => {
  it("keeps sales closed while the deployment switch is off, even if a tribe opened them", async () => {
    const startCheckout = vi.fn();
    const execute = startAcademySubscription({
      academySubscriptionRepository: buildRepository({ startCheckout }),
      isAcademySalesActivationAllowed: () => false,
    });

    await expect(
      execute({ acceptedOfferVersion: 1, correlationId: "request-1", tribeSlug: "matematica-pro" })
    ).resolves.toEqual({ status: "sales_closed" });
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("requires the accepted offer version", async () => {
    const execute = startAcademySubscription({
      academySubscriptionRepository: buildRepository(),
      isAcademySalesActivationAllowed: () => true,
    });

    await expect(
      execute({ acceptedOfferVersion: 0, correlationId: "request-1", tribeSlug: "matematica-pro" })
    ).resolves.toEqual({ status: "invalid_input" });
  });

  it("delegates with the normalized slug", async () => {
    const startCheckout = vi.fn(async () => ({ checkoutUrl: "https://checkout.example", status: "redirect" as const }));
    const execute = startAcademySubscription({
      academySubscriptionRepository: buildRepository({ startCheckout }),
      isAcademySalesActivationAllowed: () => true,
    });

    await execute({ acceptedOfferVersion: 3, correlationId: "request-1", tribeSlug: " Matematica-Pro " });

    expect(startCheckout).toHaveBeenCalledWith({
      acceptedOfferVersion: 3,
      correlationId: "request-1",
      tribeSlug: "matematica-pro",
    });
  });
});
