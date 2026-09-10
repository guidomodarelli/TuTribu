import { vi, describe, it, expect, afterEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeSubscriptionPaymentStatus } from "@/components/subscriptions/tribe-subscription-payment-status";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";

describe("TribeSubscriptionPaymentStatus", () => {
  const previousFetch = global.fetch;
  const previousConsoleError = console.error;

  afterEach(() => {
    global.fetch = previousFetch;
    console.error = previousConsoleError;
    vi.clearAllMocks();
  });

  it.each([
    [
      TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
      "Estamos esperando confirmación de pago",
    ],
    [TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused, "Tu suscripción está pausada"],
  ])("renders the %s subscription payment state", (subscriptionStatus, message) => {
    render(
      <TribeSubscriptionPaymentStatus
        subscriptionStatus={subscriptionStatus}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Volver a pagar" })
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked,
      "No pudimos confirmar tu pago. Podés volver a pagar con el precio actual.",
    ],
    [
      TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
      "Tu suscripción fue cancelada. Podés volver a pagar cuando quieras recuperar el acceso.",
    ],
  ])(
    "starts a direct checkout when subscription status is %s",
    async (subscriptionStatus, message) => {
      const user = userEvent.setup();
      console.error = vi.fn();
      global.fetch = vi.fn(async () => ({
        json: async () => ({
          checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout",
        }),
        ok: true,
      })) as Mock;

      render(
        <TribeSubscriptionPaymentStatus
          subscriptionStatus={subscriptionStatus}
          tribeSlug="matematica-pro"
        />
      );

      expect(screen.getByText(message)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Volver a pagar" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/subscriptions/start",
          expect.objectContaining({
            method: "POST",
          })
        );
      });
    }
  );

  it("shows a safe retry error when checkout cannot start", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        message: "No pudimos iniciar el pago. Intentá de nuevo.",
      }),
      ok: false,
    })) as Mock;

    render(
      <TribeSubscriptionPaymentStatus
        subscriptionStatus={TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Volver a pagar" }));

    expect(
      await screen.findByText("No pudimos iniciar el pago. Intentá de nuevo.")
    ).toBeInTheDocument();
  });

  it("shows the safe fallback when the retry request fails unexpectedly", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => {
      throw new Error("Failed to fetch");
    }) as Mock;

    render(
      <TribeSubscriptionPaymentStatus
        subscriptionStatus={TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Volver a pagar" }));

    expect(
      await screen.findByText("No pudimos iniciar el pago. Intentá de nuevo.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });
});
