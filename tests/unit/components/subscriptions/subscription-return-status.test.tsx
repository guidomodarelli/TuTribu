import { vi, describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SubscriptionReturnStatus } from "@/components/subscriptions/subscription-return-status";

describe("SubscriptionReturnStatus", () => {
  it("announces a busy confirmation while Mercado Pago is being checked", () => {
    render(<SubscriptionReturnStatus onRetry={vi.fn()} phase="checking" />);

    const heading = screen.getByRole("heading", {
      name: "Estamos confirmando tu suscripción",
    });
    const liveRegion = heading.closest("section");

    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByRole("button", { name: "Actualizar estado" })
    ).not.toBeInTheDocument();
  });

  it("offers a manual refresh once automatic checks stop", () => {
    const onRetry = vi.fn();

    render(<SubscriptionReturnStatus onRetry={onRetry} phase="exhausted" />);

    const heading = screen.getByRole("heading", {
      name: "Todavía no recibimos la confirmación",
    });

    expect(heading.closest("section")).toHaveAttribute("aria-busy", "false");
    expect(heading.closest("section")).toHaveAttribute("aria-live", "polite");

    fireEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
