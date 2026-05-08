import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeSubscriptionPriceManagement } from "@/components/subscriptions/tribe-subscription-price-management";

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

describe("TribeSubscriptionPriceManagement", () => {
  const previousFetch = global.fetch;

  afterEach(() => {
    global.fetch = previousFetch;
    jest.clearAllMocks();
  });

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

  it("shows the amount field error returned by the price creation endpoint", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(async () => ({
      json: async () => ({
        fieldErrors: {
          amount: "El precio mensual mínimo es $ 15.",
        },
        message: "Definí un nombre y un precio mensual válido.",
      }),
      ok: false,
    })) as jest.Mock;

    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        prices={[]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(screen.getByLabelText("Nombre"), "Plan mensual");
    await user.type(screen.getByLabelText("Precio mensual"), "10");
    await user.click(screen.getByRole("button", { name: "Crear precio" }));

    const amountInput = screen.getByLabelText("Precio mensual");
    const amountError = await screen.findByText(
      "El precio mensual mínimo es $ 15."
    );

    expect(amountInput).toHaveAttribute("aria-invalid", "true");
    expect(amountInput).toHaveAccessibleDescription(
      "El precio mensual mínimo es $ 15."
    );
    expect(amountError).toBeInTheDocument();
  });
});
