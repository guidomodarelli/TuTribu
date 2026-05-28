import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { TribeInvitationManagement } from "@/components/tribes/tribe-invitation-management";

const writeTextMock = jest.fn(async () => undefined);

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const baseInvitation = {
  campaignName: null,
  channel: null,
  createdAt: "2026-04-26T07:00:00.000Z",
  createdByName: "Grace Hopper",
  id: "invitation-1",
  invitationUrl:
    "https://tutribu.example.com/matematica-pro/invitar/token",
  referrerHandle: null,
  subscriptionAssociation: { type: "current" as const },
};

describe("TribeInvitationManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    writeTextMock.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });
  });

  it("creates a reusable invitation link after the user picks a plan", async () => {
    const user = userEvent.setup();
    const invitationUrl =
      "https://tutribu.example.com/matematica-pro/invitar/token";

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        invitation: {
          ...baseInvitation,
          invitationUrl,
          subscriptionAssociation: { type: "current" },
        },
        invitationUrl,
        message: "Link de invitación creado.",
      }),
      ok: true,
    });

    render(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[]}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Invitaciones",
      })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Crear link/ }));

    expect(
      await screen.findByRole("heading", {
        name: "Nuevo link de invitación",
      })
    ).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: /^Crear link$/ });
    expect(submitButton).toBeDisabled();

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(
      await screen.findByRole("option", { name: "Plan actual" })
    );

    await user.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/invitations",
        expect.objectContaining({
          body: JSON.stringify({
            campaignName: null,
            channel: "direct",
            referrerHandle: null,
            subscriptionAssociation: { type: "current" },
          }),
          method: "POST",
        })
      );
    });
    expect(screen.getByText("Link activo")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Link de invitación creado.");
  });

  it("asks for confirmation before revoking an active invitation", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        message: "Invitación revocada.",
      }),
      ok: true,
    });

    render(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[baseInvitation]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Revocar" }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { name: "¿Revocar este link?" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revocar link" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/invitations/invitation-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    expect(screen.getByText("Todavía no hay invitaciones activas.")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Invitación revocada.");
  });

  it("changes the plan associated with an existing invitation", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        invitation: {
          ...baseInvitation,
          subscriptionAssociation: { type: "free" },
        },
        message: "Plan asociado actualizado.",
      }),
      ok: true,
    });

    render(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[baseInvitation]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));
    await user.click((await screen.findAllByRole("combobox"))[0]);
    await user.click(
      await screen.findByRole("option", { name: "Plan gratuito" })
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/invitations/invitation-1/subscription-association",
        expect.objectContaining({
          body: JSON.stringify({
            subscriptionAssociation: { type: "free" },
          }),
          method: "PATCH",
        })
      );
    });
    expect(toast.success).toHaveBeenCalledWith("Plan asociado actualizado.");
  });

  it("hides price-only association controls when the viewer cannot manage prices", async () => {
    const user = userEvent.setup();

    render(
      <TribeInvitationManagement
        availablePrices={[
          {
            amountCents: 500000,
            currency: "ARS",
            id: "price-1",
            isCurrent: false,
            mercadoPagoAccountEmail: null,
            mercadoPagoAccountLabel: null,
            name: "Plan mensual",
            trial: null,
          },
        ]}
        canManagePrices={false}
        invitations={[baseInvitation]}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.queryByRole("button", { name: "Cambiar plan" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Crear link/ }));
    await user.click((await screen.findAllByRole("combobox"))[0]);

    expect(
      await screen.findByRole("option", { name: "Plan actual" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Plan gratuito" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Plan mensual/ })
    ).not.toBeInTheDocument();
  });

  it("blocks invitation creation when the referrer handle only contains the prefix", async () => {
    const user = userEvent.setup();

    render(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: /Crear link/ }));
    await user.type(screen.getByLabelText("Referente"), "@");

    expect(
      screen.getByText(
        "Revisá el canal, la campaña y el referente antes de guardar."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Crear link$/ })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("displays the Mercado Pago account and trial period inside the associated-plan badge", () => {
    render(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[
          {
            ...baseInvitation,
            subscriptionAssociation: {
              plan: {
                amountCents: 1500,
                currency: "ARS",
                frequency: "monthly",
                id: "price-1",
                mercadoPagoAccountEmail: "guido@example.com",
                mercadoPagoAccountLabel: "[Guido] Test",
                name: "[Guido] Test",
                status: "active",
                trial: { frequency: 7, frequencyType: "days" },
              },
              priceId: "price-1",
              type: "specific",
            },
          },
        ]}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByText(
        /\[Guido\] Test\s+·\s+15\s+ARS\s+·\s+\[Guido\] Test \(guido@example\.com\)\s+·\s+7 días gratis/
      )
    ).toBeInTheDocument();
  });

  it("includes account and trial details in the create-plan selector options", async () => {
    const user = userEvent.setup();

    render(
      <TribeInvitationManagement
        availablePrices={[
          {
            amountCents: 1500,
            currency: "ARS",
            id: "price-1",
            isCurrent: false,
            mercadoPagoAccountEmail: "guido@example.com",
            mercadoPagoAccountLabel: "[Guido] Test",
            name: "[Guido] Test",
            trial: { frequency: 7, frequencyType: "days" },
          },
        ]}
        canManagePrices
        invitations={[]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: /Crear link/ }));
    await user.click((await screen.findAllByRole("combobox"))[0]);

    expect(
      await screen.findByRole("option", {
        name: /\[Guido\] Test\s+·\s+15\s+ARS\s+·\s+\[Guido\] Test \(guido@example\.com\)\s+·\s+7 días gratis/,
      })
    ).toBeInTheDocument();
  });
});
