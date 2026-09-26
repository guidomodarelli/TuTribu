import { vi, describe, it, expect, afterEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeSubscriptionPaymentStatus } from "@/components/subscriptions/tribe-subscription-payment-status";
import * as browserNavigation from "@/lib/browser-navigation";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";

// The project's navigation boundary: jsdom cannot leave the document for the checkout.
vi.mock("@/lib/browser-navigation", () => ({
  navigateToUrl: vi.fn(),
}));

const CHECKOUT_URL = "https://www.mercadopago.com.ar/subscriptions/checkout";

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
          checkoutUrl: CHECKOUT_URL,
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
        expect(browserNavigation.navigateToUrl).toHaveBeenCalledWith(CHECKOUT_URL);
      });
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/subscriptions/start",
        expect.objectContaining({
          method: "POST",
        })
      );
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

  it("keeps the retry action disabled while the browser leaves for the checkout", async () => {
    const user = userEvent.setup();
    console.error = vi.fn();
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        checkoutUrl: CHECKOUT_URL,
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionPaymentStatus
        subscriptionStatus={TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked}
        tribeSlug="matematica-pro"
      />
    );

    const retryButton = screen.getByRole("button", { name: "Volver a pagar" });

    await user.click(retryButton);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Un momento, te llevamos al siguiente paso.")
    ).toBeInTheDocument();
    expect(retryButton).toBeDisabled();
    expect(retryButton).toHaveAttribute("aria-busy", "true");
    expect(browserNavigation.navigateToUrl).toHaveBeenCalledTimes(1);
    expect(browserNavigation.navigateToUrl).toHaveBeenCalledWith(CHECKOUT_URL);
  });

  it("starts a single checkout when the retry action is double-clicked", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(
      () => new Promise(() => undefined)
    ) as unknown as Mock;

    render(
      <TribeSubscriptionPaymentStatus
        subscriptionStatus={TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled}
        tribeSlug="matematica-pro"
      />
    );

    await user.dblClick(screen.getByRole("button", { name: "Volver a pagar" }));

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("re-enables the retry action and announces the error when checkout cannot start", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      json: async () => ({}),
      ok: false,
    })) as Mock;

    render(
      <TribeSubscriptionPaymentStatus
        subscriptionStatus={TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Volver a pagar" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /^No pudimos iniciar el pago. Intentá de nuevo.$/
      )
    );
    expect(screen.getByRole("button", { name: "Volver a pagar" })).toBeEnabled();
  });

  it("shows the safe fallback when the retry request fails unexpectedly", async () => {
    const user = userEvent.setup();
    console.error = vi.fn();
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
