import { render, screen, waitFor } from "@testing-library/react";
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
  const activePrice = {
    activeSubscribersCount: 0,
    amountCents: 500000,
    createdAt: "2026-05-06T12:00:00.000Z",
    currency: "ARS" as const,
    frequency: "monthly" as const,
    id: "price-1",
    isCurrent: false,
    name: "Plan mensual",
    status: "active" as const,
  };

  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
        json: async () => ({
        canceledPriceIds: [],
        message: "Planes verificados con Mercado Pago.",
        prices: [activePrice],
        verifiedCount: 1,
      }),
      ok: true,
    })) as jest.Mock;
  });

  afterEach(() => {
    global.fetch = previousFetch;
    jest.clearAllMocks();
  });

  it("renders the current-price action with Spanish product copy", () => {
    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("button", { name: "Marcar como actual" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verificar plan" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verificar suscriptores" })
    ).toBeInTheDocument();
  });

  it("should verify provider plans when the prices page loads", async () => {
    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      await screen.findByText("Verificando planes con Mercado Pago...")
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices/verify-provider-plans",
        expect.objectContaining({
          method: "POST",
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  it("should keep canceled prices visible after the automatic verification", async () => {
    global.fetch = jest.fn(async () => ({
      json: async () => ({
        canceledPriceIds: ["price-1"],
        message: "Planes verificados con Mercado Pago.",
        prices: [
          {
            ...activePrice,
            isCurrent: false,
            status: "canceled",
          },
        ],
        verifiedCount: 1,
      }),
      ok: true,
    })) as jest.Mock;

    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
    expect(screen.getByText("Plan mensual")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verificar plan" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Verificar suscriptores" })
    ).toBeDisabled();
  });

  it("should verify one provider plan from the row action", async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: "Planes verificados con Mercado Pago.",
          prices: [activePrice],
          verifiedCount: 1,
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          message: "El plan figura cancelado en Mercado Pago.",
          price: {
            ...activePrice,
            isCurrent: false,
            status: "canceled",
          },
        }),
        ok: true,
      }) as jest.Mock;

    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole("button", { name: "Verificar plan" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices/price-1/verify-provider-plan",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(screen.getByText("Cancelado")).toBeInTheDocument();
    });
  });

  it("should show provider subscriber count without enabling deletion for local associations", async () => {
    const user = userEvent.setup();
    const priceWithLocalAssociation = {
      ...activePrice,
      activeSubscribersCount: 1,
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: "Planes verificados con Mercado Pago.",
          prices: [priceWithLocalAssociation],
          verifiedCount: 1,
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          message: "Suscriptores verificados con Mercado Pago.",
          price: {
            ...priceWithLocalAssociation,
          },
          providerActiveSubscribersCount: 0,
          verifiedCount: 3,
        }),
        ok: true,
      }) as jest.Mock;

    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        prices={[priceWithLocalAssociation]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    await user.click(
      screen.getByRole("button", { name: "Verificar suscriptores" })
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices/price-1/verify-provider-subscribers",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(screen.getByText("1 miembros asociados")).toBeInTheDocument();
      expect(
        screen.getByText("0 suscriptores vigentes en Mercado Pago")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();
    });
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
