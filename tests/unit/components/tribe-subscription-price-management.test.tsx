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
  const subscriberDiagnostics = {
    lastReconciledAt: "2026-05-12T01:00:00.000Z",
    localActiveSubscribersCount: 2,
    mercadoPagoAuthorizedSubscribersCount: 2,
    mercadoPagoCanceledOrMissingSubscribersCount: 1,
    mercadoPagoPausedSubscribersCount: 0,
    mercadoPagoPendingSubscribersCount: 3,
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
        isMercadoPagoConnected
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("button", { name: "Marcar como actual" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verificar plan" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verificar suscriptores" })
    ).toBeInTheDocument();
    expect(screen.getByText("Conectado")).toBeInTheDocument();
  });

  it("should render prices as an operational table with creation and help sections", () => {
    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Crear nuevo precio" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Nombre" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Precio mensual" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Estado" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Acciones" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sobre los precios" })
    ).toBeInTheDocument();
  });

  it("should hide Mercado Pago connection health for read-only users", () => {
    render(
      <TribeSubscriptionPriceManagement
        canManagePrices={false}
        isMercadoPagoConnected={false}
        prices={[]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    expect(screen.queryByText("Conectado")).not.toBeInTheDocument();
    expect(screen.queryByText("Requiere reconexión")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Conectar Mercado Pago" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Detalle de suscriptores" })
    ).not.toBeInTheDocument();
  });

  it("should render subscriber diagnostics only for leaders", () => {
    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        subscriberDiagnostics={subscriberDiagnostics}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Detalle de suscriptores" })
    ).toBeInTheDocument();
    expect(screen.getByText("Activos locales")).toBeInTheDocument();
    expect(screen.getByText("Pendientes en Mercado Pago")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Actualizar diagnóstico" })
    ).toBeInTheDocument();
  });

  it("should update subscriber diagnostics from the manual action", async () => {
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
          diagnostics: {
            ...subscriberDiagnostics,
            localActiveSubscribersCount: 4,
            mercadoPagoAuthorizedSubscribersCount: 4,
          },
          message: "Diagnóstico actualizado con Mercado Pago.",
          verifiedCount: 6,
        }),
        ok: true,
      }) as jest.Mock;

    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        subscriberDiagnostics={subscriberDiagnostics}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    await user.click(
      screen.getByRole("button", { name: "Actualizar diagnóstico" })
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/subscriptions/subscriber-diagnostics/reconcile",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(
        screen.getByText("Diagnóstico actualizado con Mercado Pago.")
      ).toBeInTheDocument();
      expect(screen.getAllByText("4")).toHaveLength(2);
    });
  });

  it("should keep diagnostics visible and show a safe error when reconciliation fails", async () => {
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
          message: "No pudimos actualizar el diagnóstico. Intentá de nuevo.",
        }),
        ok: false,
      }) as jest.Mock;

    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        subscriberDiagnostics={subscriberDiagnostics}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    await user.click(
      screen.getByRole("button", { name: "Actualizar diagnóstico" })
    );

    expect(
      await screen.findByText(
        "No pudimos actualizar el diagnóstico. Intentá de nuevo."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Detalle de suscriptores" })
    ).toBeInTheDocument();
  });

  it("should update one provider plan from the inline edit action", async () => {
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
          message: "Precio actualizado.",
          price: {
            ...activePrice,
            name: "Plan premium",
          },
        }),
        ok: true,
      }) as jest.Mock;

    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Nuevo nombre"));
    await user.type(screen.getByLabelText("Nuevo nombre"), "Plan premium");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices/price-1",
        expect.objectContaining({
          body: JSON.stringify({
            amount: "5000",
            name: "Plan premium",
          }),
          method: "PATCH",
        })
      );
      expect(screen.getByText("Plan premium")).toBeInTheDocument();
    });
  });

  it("should remove a canceled price after the delete action", async () => {
    const user = userEvent.setup();
    const canceledPrice = {
      ...activePrice,
      isCurrent: false,
      status: "canceled" as const,
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: "Planes verificados con Mercado Pago.",
          prices: [canceledPrice],
          verifiedCount: 1,
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          deletedPriceId: "price-1",
          message: "Precio eliminado.",
        }),
        ok: true,
      }) as jest.Mock;

    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        isMercadoPagoConnected
        prices={[canceledPrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices/price-1",
        expect.objectContaining({
          method: "DELETE",
        })
      );
      expect(screen.queryByText("Plan mensual")).not.toBeInTheDocument();
    });
  });

  it("should verify provider plans when the prices page loads", async () => {
    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        isMercadoPagoConnected
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
        isMercadoPagoConnected
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
        isMercadoPagoConnected
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
        isMercadoPagoConnected
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

  it("should verify canceled price subscribers and enable deletion when Mercado Pago has no active associations", async () => {
    const user = userEvent.setup();
    const canceledPriceWithLocalAssociation = {
      ...activePrice,
      activeSubscribersCount: 1,
      isCurrent: false,
      status: "canceled" as const,
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: "Planes verificados con Mercado Pago.",
          prices: [canceledPriceWithLocalAssociation],
          verifiedCount: 1,
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          message: "Suscriptores verificados con Mercado Pago.",
          price: {
            ...canceledPriceWithLocalAssociation,
            activeSubscribersCount: 0,
          },
          providerActiveSubscribersCount: 0,
          verifiedCount: 1,
        }),
        ok: true,
      }) as jest.Mock;

    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        isMercadoPagoConnected
        prices={[canceledPriceWithLocalAssociation]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText("Planes verificados con Mercado Pago.")
    ).toBeInTheDocument();

    const verifySubscribersButton = screen.getByRole("button", {
      name: "Verificar suscriptores",
    });
    expect(verifySubscribersButton).toBeEnabled();
    await user.click(verifySubscribersButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices/price-1/verify-provider-subscribers",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(screen.getByText("0 miembros asociados")).toBeInTheDocument();
      expect(
        screen.getByText("0 suscriptores vigentes en Mercado Pago")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Eliminar" })).toBeEnabled();
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
        isMercadoPagoConnected
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

  it("should block price creation and start Mercado Pago connection automatically when reconnection is required", async () => {
    const navigateToMercadoPagoConnection = jest.fn();

    render(
      <TribeSubscriptionPriceManagement
        canManagePrices
        isMercadoPagoConnected={false}
        navigateToMercadoPagoConnection={navigateToMercadoPagoConnection}
        prices={[]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByText(
        "Mercado Pago requiere reconexión. Estamos intentando conectarte automáticamente."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Requiere reconexión")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toBeDisabled();
    expect(screen.getByLabelText("Precio mensual")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear precio" })).toBeDisabled();

    await waitFor(() => {
      expect(navigateToMercadoPagoConnection).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/mercado-pago/oauth/start"
      );
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
