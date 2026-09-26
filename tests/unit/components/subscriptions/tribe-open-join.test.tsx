import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeOpenJoin } from "@/components/subscriptions/tribe-open-join";

const OPEN_JOIN_OFFER = {
  amountCents: 1_250_000,
  currency: "ARS",
  name: "Plan mensual",
};

describe("TribeOpenJoin", () => {
  it("renders the current offer with its localized monthly amount", () => {
    render(<TribeOpenJoin offer={OPEN_JOIN_OFFER} startAction={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Completá tu suscripción" })
    ).toBeInTheDocument();
    expect(screen.getByText("Plan mensual")).toBeInTheDocument();
    expect(screen.getByText("Precio mensual")).toBeInTheDocument();
    expect(screen.getByText(/12\.500,00/)).toBeInTheDocument();
  });

  it("disables the checkout button while the start action is pending so it cannot be submitted twice", async () => {
    const user = userEvent.setup();
    const startAction = vi.fn(() => new Promise<void>(() => undefined));

    render(<TribeOpenJoin offer={OPEN_JOIN_OFFER} startAction={startAction} />);

    await user.click(
      screen.getByRole("button", { name: "Continuar con el pago" })
    );

    const pendingButton = await screen.findByRole("button", {
      name: "Te llevamos a Mercado Pago…",
    });

    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");

    await user.click(pendingButton);

    expect(startAction).toHaveBeenCalledTimes(1);
  });
});
