import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "beez-ui";

import { TribeSubscriptionPriceManagement } from "@/components/subscriptions/tribe-subscription-price-management";

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

/** Message the provider plan verification endpoint returns in these tests. */
const PROVIDER_PLANS_VERIFIED_MESSAGE = "Planes verificados con Mercado Pago.";

/**
 * Waits for the provider plan verification that managers trigger on load, so
 * its state updates finish inside the test instead of after it.
 */
async function waitForLoadVerification() {
  expect(await screen.findByText(PROVIDER_PLANS_VERIFIED_MESSAGE)).toBeInTheDocument();
}

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
    mercadoPagoAccountLabel: "Cuenta principal",
    mercadoPagoAccountEmail: "leader@example.com",
    name: "Plan mensual",
    paymentIntegrationId: "integration-1",
    providerAccountId: "collector-1",
    status: "active" as const,
    trial: {
      frequency: 7,
      frequencyType: "days" as const,
    },
  };
  const mercadoPagoAccount = {
    accountLabel: "Cuenta principal",
    id: "integration-1",
    providerAccountEmail: "leader@example.com",
    providerAccountId: "collector-1",
    status: "connected" as const,
  };
  const reconnectingMercadoPagoAccount = {
    accountLabel: "Cuenta anterior",
    id: "revoked-integration",
    providerAccountEmail: "old@example.com",
    providerAccountId: "collector-old",
    status: "requires_reconnection" as const,
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
    global.fetch = vi.fn(async () => ({
        json: async () => ({
        canceledPriceIds: [],
        message: PROVIDER_PLANS_VERIFIED_MESSAGE,
        prices: [activePrice],
        verifiedCount: 1,
      }),
      ok: true,
    })) as Mock;
  });

  afterEach(() => {
    global.fetch = previousFetch;
    vi.clearAllMocks();
  });

  it("renders the current-price action with Spanish product copy", async () => {
    render(
      <TribeSubscriptionPriceManagement
        availableMercadoPagoAccounts={[mercadoPagoAccount]}
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitForLoadVerification();

    expect(
      screen.getAllByRole("button", { name: "Marcar como actual" })
    ).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verificar plan" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verificar suscriptores" })
    ).toBeInTheDocument();
    expect(screen.getByText("Conectado")).toBeInTheDocument();
  });

  it("should render prices as an operational table with creation and help sections", async () => {
    render(
      <TribeSubscriptionPriceManagement
        availableMercadoPagoAccounts={[mercadoPagoAccount]}
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitForLoadVerification();

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
      screen.getByRole("columnheader", { name: "Prueba gratis" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("leader@example.com").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("columnheader", { name: "Estado" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Acciones" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sobre los planes" })
    ).toBeInTheDocument();
  });

  it("should present prices as a plan catalog instead of historical versions", async () => {
    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitForLoadVerification();

    expect(
      screen.getByRole("table", { name: "Catálogo de planes" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Gestioná los planes disponibles para nuevas suscripciones. Mercado Pago mantiene congeladas las condiciones de cada suscriptor existente."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/versiones históricas/i)).not.toBeInTheDocument();
  });

  it("should hide Mercado Pago connection health for read-only users", () => {
    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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

  it("focuses the inline editor and returns focus to the edit button when Escape cancels it", async () => {
    const user = userEvent.setup();

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Nuevo nombre")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Editar" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText("Nuevo nombre")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the singular label for a single associated member", () => {
    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices={false}
        isMercadoPagoConnected
        prices={[{ ...activePrice, activeSubscribersCount: 1 }]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByText("1 miembro asociado")).toBeInTheDocument();
    expect(screen.queryByText("1 miembros asociados")).not.toBeInTheDocument();
  });

  it("should render subscriber diagnostics only for leaders", async () => {
    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        subscriberDiagnostics={subscriberDiagnostics}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitForLoadVerification();

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
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
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
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
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
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
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
            trial: {
              frequency: 14,
              frequencyType: "days",
            },
          },
        }),
        ok: true,
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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
    const editTrialFrequencyInput = screen.getAllByLabelText(
      "Días de prueba gratis"
    )[1];
    await user.clear(editTrialFrequencyInput);
    await user.type(editTrialFrequencyInput, "14");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices/price-1",
        expect.objectContaining({
          body: JSON.stringify({
            amount: "5000",
            name: "Plan premium",
            trialFrequency: "14",
            trialFrequencyType: "days",
          }),
          method: "PATCH",
        })
      );
      expect(screen.getByText("Plan premium")).toBeInTheDocument();
      expect(screen.getByText("14 días")).toBeInTheDocument();
    });
  });

  it("should allow editing a price while preserving an existing long synchronized trial", async () => {
    const user = userEvent.setup();
    const longTrialPrice = {
      ...activePrice,
      trial: {
        frequency: 21,
        frequencyType: "days" as const,
      },
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
          prices: [longTrialPrice],
          verifiedCount: 1,
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          message: "Precio actualizado.",
          price: {
            ...longTrialPrice,
            name: "Plan premium",
          },
        }),
        ok: true,
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[longTrialPrice]}
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
            trialFrequency: "21",
            trialFrequencyType: "days",
          }),
          method: "PATCH",
        })
      );
      expect(screen.getByText("Plan premium")).toBeInTheDocument();
      expect(screen.getByText("21 días")).toBeInTheDocument();
    });
  });

  it("should preserve an existing monthly trial unit when editing a price", async () => {
    const user = userEvent.setup();
    const monthlyTrialPrice = {
      ...activePrice,
      trial: {
        frequency: 1,
        frequencyType: "months" as const,
      },
    };
    global.fetch = vi.fn().mockResolvedValueOnce({
      json: async () => ({
        message: "Precio actualizado.",
        price: {
          ...monthlyTrialPrice,
          name: "Plan mensual actualizado",
        },
      }),
      ok: true,
    }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[monthlyTrialPrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByText("1 mes")).toBeInTheDocument();
    expect(screen.queryByText("1 días")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Nuevo nombre"));
    await user.type(
      screen.getByLabelText("Nuevo nombre"),
      "Plan mensual actualizado"
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices/price-1",
        expect.objectContaining({
          body: JSON.stringify({
            amount: "5000",
            name: "Plan mensual actualizado",
            trialFrequency: "1",
            trialFrequencyType: "months",
          }),
          method: "PATCH",
        })
      );
    });
  });

  it("should send days when editing the trial frequency from a monthly trial price", async () => {
    const user = userEvent.setup();
    const monthlyTrialPrice = {
      ...activePrice,
      trial: {
        frequency: 1,
        frequencyType: "months" as const,
      },
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
          prices: [monthlyTrialPrice],
          verifiedCount: 1,
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          message: "Precio actualizado.",
          price: {
            ...monthlyTrialPrice,
            name: "Plan mensual actualizado",
            trial: {
              frequency: 7,
              frequencyType: "days",
            },
          },
        }),
        ok: true,
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[monthlyTrialPrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Nuevo nombre"));
    await user.type(
      screen.getByLabelText("Nuevo nombre"),
      "Plan mensual actualizado"
    );
    const editTrialFrequencyInput = screen.getAllByLabelText(
      "Días de prueba gratis"
    )[1];
    await user.clear(editTrialFrequencyInput);
    await user.type(editTrialFrequencyInput, "7");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices/price-1",
        expect.objectContaining({
          body: JSON.stringify({
            amount: "5000",
            name: "Plan mensual actualizado",
            trialFrequency: "7",
            trialFrequencyType: "days",
          }),
          method: "PATCH",
        })
      );
    });
  });

  it("should remove a canceled price after the delete action", async () => {
    const user = userEvent.setup();
    const canceledPrice = {
      ...activePrice,
      isCurrent: false,
      status: "canceled" as const,
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
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
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        canceledPriceIds: ["price-1"],
        message: PROVIDER_PLANS_VERIFIED_MESSAGE,
        prices: [
          {
            ...activePrice,
            isCurrent: false,
            status: "canceled" as const,
          },
        ],
        verifiedCount: 1,
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
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
            status: "canceled" as const,
          },
        }),
        ok: true,
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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

  it("should preserve account metadata when a row mutation response omits it", async () => {
    const user = userEvent.setup();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
          prices: [activePrice],
          verifiedCount: 1,
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          message: "El plan figura cancelado en Mercado Pago.",
          price: {
            activeSubscribersCount: activePrice.activeSubscribersCount,
            amountCents: activePrice.amountCents,
            createdAt: activePrice.createdAt,
            currency: activePrice.currency,
            frequency: activePrice.frequency,
            id: activePrice.id,
            isCurrent: false,
            name: activePrice.name,
            status: "canceled" as const,
            trial: activePrice.trial,
          },
        }),
        ok: true,
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        availableMercadoPagoAccounts={[mercadoPagoAccount]}
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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
      expect(screen.getByText("Cancelado")).toBeInTheDocument();
      expect(screen.getAllByText("leader@example.com").length).toBeGreaterThan(0);
    });
  });

  it("should show provider subscriber count without enabling deletion for local associations", async () => {
    const user = userEvent.setup();
    const priceWithLocalAssociation = {
      ...activePrice,
      activeSubscribersCount: 1,
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
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
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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
      expect(screen.getByText("1 miembro asociado")).toBeInTheDocument();
      expect(
        screen.getByText("0 suscriptores vigentes en Mercado Pago")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();
    });
  });

  it("should allow editing plans that already have associated subscribers", async () => {
    const priceWithSubscribers = {
      ...activePrice,
      activeSubscribersCount: 2,
    };

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[priceWithSubscribers]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
      expect(
        screen.queryByText(
          "Este precio tiene suscriptores asociados. Creá un nuevo plan para próximos miembros."
        )
      ).not.toBeInTheDocument();
    });
  });

  it("should render paused plans without enabling mutation actions", async () => {
    const pausedPrice = {
      ...activePrice,
      status: "paused" as const,
    };
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        canceledPriceIds: [],
        message: PROVIDER_PLANS_VERIFIED_MESSAGE,
        prices: [pausedPrice],
        verifiedCount: 1,
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[pausedPrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Pausado")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Editar" })
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByRole("button", { name: "Marcar como actual" })[1]
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Verificar plan" })
      ).toBeEnabled();
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
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
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
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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
      await screen.findByText(PROVIDER_PLANS_VERIFIED_MESSAGE)
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
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        fieldErrors: {
          amount: "El precio mensual mínimo es $ 15.",
        },
        message: "Definí un nombre y un precio mensual válido.",
      }),
      ok: false,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
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

  it("should create a price without a free trial when the trial checkbox is inactive", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        message: "Precio creado.",
        price: {
          ...activePrice,
          trial: null,
        },
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("checkbox", { name: "Agregar prueba gratis" })
    ).not.toBeChecked();
    expect(screen.getByLabelText("Días de prueba gratis")).toBeDisabled();

    await user.type(screen.getByLabelText("Nombre"), "Plan mensual");
    await user.type(screen.getByLabelText("Precio mensual"), "5000");
    await user.click(screen.getByRole("button", { name: "Crear precio" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices",
        expect.objectContaining({
          body: JSON.stringify({
            amount: "5000",
            name: "Plan mensual",
            trialFrequency: "",
            trialFrequencyType: "days",
          }),
          method: "POST",
        })
      );
      expect(screen.getByText("Sin prueba gratis")).toBeInTheDocument();
    });
  });

  it("should enable trial days and create a price with a valid free trial", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        message: "Precio creado.",
        price: {
          ...activePrice,
          trial: {
            frequency: 2,
            frequencyType: "days",
          },
        },
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Agregar prueba gratis" })
    );
    expect(screen.getByLabelText("Días de prueba gratis")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Crear precio" })).toBeDisabled();

    await user.type(screen.getByLabelText("Nombre"), "Plan mensual");
    await user.type(screen.getByLabelText("Precio mensual"), "5000");
    await user.type(screen.getByLabelText("Días de prueba gratis"), "2");
    await user.click(screen.getByRole("button", { name: "Crear precio" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices",
        expect.objectContaining({
          body: JSON.stringify({
            amount: "5000",
            name: "Plan mensual",
            trialFrequency: "2",
            trialFrequencyType: "days",
          }),
          method: "POST",
        })
      );
      expect(screen.getByText("2 días")).toBeInTheDocument();
    });
  });

  it("should block creation and show inline feedback when trial days are outside the allowed range", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn() as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Agregar prueba gratis" })
    );
    await user.type(screen.getByLabelText("Nombre"), "Plan mensual");
    await user.type(screen.getByLabelText("Precio mensual"), "5000");
    await user.type(screen.getByLabelText("Días de prueba gratis"), "15");

    const trialInput = screen.getByLabelText("Días de prueba gratis");
    const trialError = screen.getByText(
      "La prueba gratis debe ser de entre 1 y 14 días."
    );

    expect(screen.getByRole("button", { name: "Crear precio" })).toBeDisabled();
    expect(trialInput).toHaveAttribute("aria-invalid", "true");
    expect(trialInput).toHaveAccessibleDescription(
      "La prueba gratis debe ser de entre 1 y 14 días."
    );
    expect(trialError).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the trial field error returned by the price creation endpoint", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        fieldErrors: {
          trialFrequency: "La prueba gratis debe ser de entre 1 y 14 días.",
        },
        message: "Definí un nombre, un precio mensual y una prueba gratis válidos.",
      }),
      ok: false,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Agregar prueba gratis" })
    );
    await user.type(screen.getByLabelText("Nombre"), "Plan mensual");
    await user.type(screen.getByLabelText("Precio mensual"), "5000");
    await user.type(screen.getByLabelText("Días de prueba gratis"), "2");
    await user.click(screen.getByRole("button", { name: "Crear precio" }));

    const trialInput = screen.getByLabelText("Días de prueba gratis");
    const trialError = await screen.findByText(
      "La prueba gratis debe ser de entre 1 y 14 días."
    );

    expect(trialInput).toHaveAttribute("aria-invalid", "true");
    expect(trialInput).toHaveAccessibleDescription(
      "La prueba gratis debe ser de entre 1 y 14 días."
    );
    expect(trialError).toBeInTheDocument();
  });

  it("should block price creation and start Mercado Pago connection automatically when reconnection is required", async () => {
    const navigateToMercadoPagoConnection = vi.fn();

    render(
      <TribeSubscriptionPriceManagement openFreeJoinEnabled={false}
        freeJoinIsCurrent
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

  it("should create a price with the first connected Mercado Pago account", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        message: "Precio creado.",
        price: activePrice,
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        availableMercadoPagoAccounts={[
          reconnectingMercadoPagoAccount,
          mercadoPagoAccount,
        ]}
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getAllByText("leader@example.com").length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("Nombre"), "Plan mensual");
    await user.type(screen.getByLabelText("Precio mensual"), "5000");
    await user.click(screen.getByRole("button", { name: "Crear precio" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices",
        expect.objectContaining({
          body: JSON.stringify({
            amount: "5000",
            name: "Plan mensual",
            paymentIntegrationId: "integration-1",
            trialFrequency: "",
            trialFrequencyType: "days",
          }),
          method: "POST",
        })
      );
    });
  });

  it("should update the selected Mercado Pago account label", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        account: {
          ...mercadoPagoAccount,
          accountLabel: "Cuenta de cursos",
          providerAccountEmail: null,
        },
        message: "Alias actualizado.",
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        availableMercadoPagoAccounts={[
          {
            ...mercadoPagoAccount,
            providerAccountEmail: null,
          },
        ]}
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    const accountLabelInput = screen.getByLabelText("Alias");

    await user.clear(accountLabelInput);
    await user.type(accountLabelInput, "Cuenta de cursos");
    await user.click(screen.getByRole("button", { name: "Guardar alias" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/subscriptions/mercado-pago-accounts/integration-1",
        expect.objectContaining({
          body: JSON.stringify({
            accountLabel: "Cuenta de cursos",
          }),
          method: "PATCH",
        })
      );
    });
  });

  it("should save the selected Mercado Pago account label with Enter without creating a price", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        account: {
          ...mercadoPagoAccount,
          accountLabel: "Cuenta de cursos",
          providerAccountEmail: null,
        },
        message: "Alias actualizado.",
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        availableMercadoPagoAccounts={[
          {
            ...mercadoPagoAccount,
            providerAccountEmail: null,
          },
        ]}
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(screen.getByLabelText("Nombre"), "Plan mensual");
    await user.type(screen.getByLabelText("Precio mensual"), "5000");

    const accountLabelInput = screen.getByLabelText("Alias");

    await user.clear(accountLabelInput);
    await user.type(accountLabelInput, "Cuenta de cursos{enter}");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/subscriptions/mercado-pago-accounts/integration-1",
        expect.objectContaining({
          body: JSON.stringify({
            accountLabel: "Cuenta de cursos",
          }),
          method: "PATCH",
        })
      );
    });
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/subscriptions/prices",
      expect.anything()
    );
  });

  it("should allow free join selection when Mercado Pago requires reconnection", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        message: "Entrada gratis marcada como actual.",
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected={false}
        navigateToMercadoPagoConnection={vi.fn()}
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    const makeCurrentButtons = screen.getAllByRole("button", {
      name: "Marcar como actual",
    });

    expect(makeCurrentButtons[0]).toBeEnabled();
    expect(makeCurrentButtons[1]).toBeDisabled();

    await user.click(makeCurrentButtons[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/free-join/make-current",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Entrada gratis marcada como actual."
      );
    });
  });

  it("should not auto-connect when free join can be selected during reconnection", async () => {
    const navigateToMercadoPagoConnection = vi.fn();

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected={false}
        navigateToMercadoPagoConnection={navigateToMercadoPagoConnection}
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByText(
        "Mercado Pago requiere reconexión para crear precios pagos. Podés marcar la entrada gratis como actual."
      )
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Marcar como actual" })[0]
    ).toBeEnabled();

    await waitFor(() => {
      expect(navigateToMercadoPagoConnection).not.toHaveBeenCalled();
    });
  });

  it("should mark free join as current after provider verification cancels the current paid price", async () => {
    const canceledPrice = {
      ...activePrice,
      isCurrent: false,
      status: "canceled" as const,
    };
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        canceledPriceIds: ["price-1"],
        freeJoinIsCurrent: true,
        message: PROVIDER_PLANS_VERIFIED_MESSAGE,
        prices: [canceledPrice],
        verifiedCount: 1,
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionPriceManagement
        freeJoinIsCurrent={false}
        openFreeJoinEnabled={false}
        canManagePrices
        isMercadoPagoConnected
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Actual")).toBeInTheDocument();
      expect(
        screen.getByText(PROVIDER_PLANS_VERIFIED_MESSAGE)
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole("button", { name: "Marcar como actual" })[0]
      ).toBeDisabled();
    });
  });

  it("should enable free join selection after marking a paid price as current", async () => {
    const user = userEvent.setup();
    const paidPrice = {
      ...activePrice,
      isCurrent: false,
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          canceledPriceIds: [],
          message: PROVIDER_PLANS_VERIFIED_MESSAGE,
          prices: [paidPrice],
          verifiedCount: 1,
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          message: "Precio marcado como actual.",
          price: {
            ...paidPrice,
            isCurrent: true,
          },
        }),
        ok: true,
      }) as Mock;

    render(
      <TribeSubscriptionPriceManagement openFreeJoinEnabled={false}
        freeJoinIsCurrent
        canManagePrices
        isMercadoPagoConnected
        prices={[paidPrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Marcar como actual" })[1]
      ).toBeEnabled();
    });

    const initialMakeCurrentButtons = screen.getAllByRole("button", {
      name: "Marcar como actual",
    });
    expect(initialMakeCurrentButtons[0]).toBeDisabled();

    await user.click(initialMakeCurrentButtons[1]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/subscriptions/prices/price-1/make-current",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(
        screen.getAllByRole("button", { name: "Marcar como actual" })[0]
      ).toBeEnabled();
    });
  });
  it("saves the tokenless free open join toggle next to the free entry row", async () => {
    const user = userEvent.setup();

    render(
      <TribeSubscriptionPriceManagement
        availableMercadoPagoAccounts={[mercadoPagoAccount]}
        canManagePrices
        freeJoinIsCurrent
        isMercadoPagoConnected
        openFreeJoinEnabled={false}
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(
      screen.getByRole("switch", { name: /permitir unirse sin invitación/i })
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/tribes/matematica-pro/free-join/open",
        expect.objectContaining({
          body: JSON.stringify({ enabled: true }),
          method: "PUT",
        })
      );
    });
  });

  it("keeps the open free join toggle disabled while the free entry is not current", async () => {
    render(
      <TribeSubscriptionPriceManagement
        availableMercadoPagoAccounts={[mercadoPagoAccount]}
        canManagePrices
        freeJoinIsCurrent={false}
        isMercadoPagoConnected
        openFreeJoinEnabled={false}
        prices={[activePrice]}
        statusMessage={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("switch", { name: /permitir unirse sin invitación/i })
    ).toBeDisabled();
    await waitForLoadVerification();
  });
});
