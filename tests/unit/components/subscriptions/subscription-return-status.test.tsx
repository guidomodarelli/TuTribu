import { render, screen } from "@testing-library/react";

import { SubscriptionReturnStatus } from "@/components/subscriptions/subscription-return-status";
import * as browserNavigation from "@/lib/browser-navigation";

jest.mock("@/lib/browser-navigation", () => ({
  reloadCurrentPage: jest.fn(),
}));

describe("SubscriptionReturnStatus", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(browserNavigation.reloadCurrentPage).mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should reload the page while Mercado Pago confirmation is pending", () => {
    render(<SubscriptionReturnStatus />);

    expect(
      screen.getByRole("heading", {
        name: "Estamos confirmando tu suscripción",
      })
    ).toBeInTheDocument();

    jest.advanceTimersByTime(3_000);

    expect(browserNavigation.reloadCurrentPage).toHaveBeenCalledTimes(1);
  });
});
