import { render, screen } from "@testing-library/react";

import { SubscriptionReturnStatus } from "@/components/subscriptions/subscription-return-status";

const refreshMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

describe("SubscriptionReturnStatus", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    refreshMock.mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should refresh the route while Mercado Pago confirmation is pending", () => {
    render(<SubscriptionReturnStatus />);

    expect(
      screen.getByRole("heading", {
        name: "Estamos confirmando tu suscripción",
      })
    ).toBeInTheDocument();

    jest.advanceTimersByTime(3_000);

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
