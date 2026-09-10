import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SubscriptionReturnStatus } from "@/components/subscriptions/subscription-return-status";
import * as browserNavigation from "@/lib/browser-navigation";

vi.mock("@/lib/browser-navigation", () => ({
  reloadCurrentPage: vi.fn(),
}));

describe("SubscriptionReturnStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(browserNavigation.reloadCurrentPage).mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("should reload the page while Mercado Pago confirmation is pending", () => {
    render(<SubscriptionReturnStatus />);

    expect(
      screen.getByRole("heading", {
        name: "Estamos confirmando tu suscripción",
      })
    ).toBeInTheDocument();

    vi.advanceTimersByTime(3_000);

    expect(browserNavigation.reloadCurrentPage).toHaveBeenCalledTimes(1);
  });
});
