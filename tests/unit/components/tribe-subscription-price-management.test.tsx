import { render, screen } from "@testing-library/react";

import { TribeSubscriptionPriceManagement } from "@/components/subscriptions/tribe-subscription-price-management";

describe("TribeSubscriptionPriceManagement", () => {
  it("renders the current-price action with Spanish product copy", () => {
    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        prices={[
          {
            activeSubscribersCount: 0,
            amountCents: 500000,
            createdAt: "2026-05-06T12:00:00.000Z",
            currency: "ARS",
            frequency: "monthly",
            id: "price-1",
            isCurrent: false,
            name: "Plan mensual",
            status: "active",
          },
        ]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("button", { name: "Marcar como actual" })
    ).toBeInTheDocument();
  });
});
