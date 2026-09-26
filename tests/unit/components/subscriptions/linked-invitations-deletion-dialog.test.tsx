import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LinkedInvitationsDeletionDialog } from "@/components/subscriptions/tribe-subscription-price-management/linked-invitations-deletion-dialog";
import type { TribeInvitationListItemResult } from "@/src/modules/tribes/application/results/tribe-invitation-result";

const LINKED_INVITATION: TribeInvitationListItemResult = {
  campaignName: null,
  channel: null,
  createdAt: "2026-05-06T12:00:00.000Z",
  createdByName: "Grace Hopper",
  id: "invitation-1",
  invitationUrl: null,
  referrerHandle: null,
  subscriptionAssociation: {
    plan: null,
    priceId: "price-1",
    type: "specific",
  },
};

const TARGET_PRICE = {
  amountCents: 750000,
  id: "price-2",
  name: "Plan anual",
};

describe("LinkedInvitationsDeletionDialog", () => {
  it("enables the confirmation only after every link has an action and warns before revoking", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <LinkedInvitationsDeletionDialog
        invitations={[LINKED_INVITATION]}
        isSubmitting={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        open
        targetPriceOptions={[TARGET_PRICE]}
      />
    );

    const confirmButton = screen.getByRole("button", {
      name: "Confirmar y eliminar plan",
    });
    expect(confirmButton).toBeDisabled();

    await user.click(screen.getByRole("combobox", { name: "Acción" }));
    await user.click(
      await screen.findByRole("option", {
        name: "Eliminar invitación (peligroso)",
      })
    );

    expect(
      await screen.findByText(
        "Los usuarios que tengan este link perderán el acceso a la tribu."
      )
    ).toBeInTheDocument();
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledWith([
      { action: "revoke", invitationId: "invitation-1" },
    ]);
  });

  it("asks for a target plan when moving the link to another plan", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <LinkedInvitationsDeletionDialog
        invitations={[LINKED_INVITATION]}
        isSubmitting={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        open
        targetPriceOptions={[TARGET_PRICE]}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Acción" }));
    await user.click(
      await screen.findByRole("option", { name: "Cambiar a otro plan" })
    );

    const confirmButton = screen.getByRole("button", {
      name: "Confirmar y eliminar plan",
    });
    expect(confirmButton).toBeDisabled();

    await user.click(
      await screen.findByRole("combobox", { name: "Plan destino" })
    );
    await user.click(await screen.findByRole("option", { name: /Plan anual/ }));

    await waitFor(() => expect(confirmButton).toBeEnabled());
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledWith([
      {
        action: "switch_to_specific",
        invitationId: "invitation-1",
        targetPriceId: "price-2",
      },
    ]);
  });

  it("shows the pending confirmation state while the deletion is submitted", () => {
    render(
      <LinkedInvitationsDeletionDialog
        invitations={[LINKED_INVITATION]}
        isSubmitting
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
        targetPriceOptions={[TARGET_PRICE]}
      />
    );

    const pendingButton = screen.getByRole("button", {
      name: "Eliminando plan...",
    });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });
});
