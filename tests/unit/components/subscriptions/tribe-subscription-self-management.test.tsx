import { vi, describe, it, expect, afterEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeSubscriptionSelfManagement } from "@/components/subscriptions/tribe-subscription-self-management";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("TribeSubscriptionSelfManagement", () => {
  const previousFetch = global.fetch;

  afterEach(() => {
    global.fetch = previousFetch;
    vi.clearAllMocks();
  });

  it("requires confirmation before canceling the member subscription", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        message: "Cancelamos tu suscripción.",
      }),
      ok: true,
    })) as Mock;

    render(
      <TribeSubscriptionSelfManagement
        subscriptionStatus={TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByText("Estado: activa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar suscripción" }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Confirmá la cancelación para aplicar el cambio en Mercado Pago y remover el acceso."
      )
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar cancelación" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/subscriptions/current",
        expect.objectContaining({
          method: "DELETE",
        })
      );
      expect(screen.getByText("Suscripción cancelada")).toBeInTheDocument();
    });
  });
});
