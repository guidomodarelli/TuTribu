import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "beez-ui";

import { TribeInvitationManagement } from "@/components/tribes/tribe-invitation-management";

const writeTextMock = vi.fn(async () => undefined);

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
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
    vi.clearAllMocks();
    global.fetch = vi.fn();
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

    (global.fetch as Mock).mockResolvedValueOnce({
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
    expect(await screen.findByText("Link activo")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Link de invitación creado.", {
      description: "El link ya está copiado en tu portapapeles.",
    });
    expect(await navigator.clipboard.readText()).toBe(invitationUrl);
    expect(
      await screen.findByRole("button", { name: "Copiado" })
    ).toBeInTheDocument();
  });

  it("asks for confirmation before revoking an active invitation", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockResolvedValueOnce({
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

    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(await screen.findByRole("menuitem", { name: "Revocar" }));

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
    expect(
      await screen.findByText("Todavía no hay invitaciones activas.")
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole("list", { name: "Invitaciones activas" })
      ).not.toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith("Invitación revocada.");
  });

  it("changes the plan associated with an existing invitation", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockResolvedValueOnce({
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

    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Cambiar plan" })
    );
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

    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    expect(
      await screen.findByRole("menuitem", { name: "Editar canal" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Cambiar plan" })
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

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

    const referrerInput = screen.getByLabelText("Referente");
    const referrerError = screen.getByRole("alert");

    expect(referrerError).toHaveTextContent(
      "Usá letras, números, puntos, guiones o guion bajo, con @ opcional al inicio."
    );
    expect(referrerInput).toHaveAttribute("aria-invalid", "true");
    expect(referrerInput).toHaveAttribute(
      "aria-describedby",
      referrerError.id
    );
    expect(screen.getByRole("button", { name: /^Crear link$/ })).toBeDisabled();

    await user.type(referrerInput, "partner");

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(referrerInput).not.toHaveAttribute("aria-invalid");
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
                status: "active" as const,
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

    expect(screen.getAllByText("[Guido] Test").length).toBeGreaterThan(0);
    expect(screen.getByText(/^15\s+ARS$/)).toBeInTheDocument();
    expect(
      screen.getByText("[Guido] Test (guido@example.com)")
    ).toBeInTheDocument();
    expect(screen.getByText("7 días gratis")).toBeInTheDocument();
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

  it("copies the invitation link from the row action", async () => {
    const user = userEvent.setup();

    render(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[baseInvitation]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Copiar link" }));

    expect(toast.success).toHaveBeenCalledWith("Link copiado.");
    expect(await navigator.clipboard.readText()).toBe(
      baseInvitation.invitationUrl
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the channel, campaign and referrer of each invitation", () => {
    render(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[
          {
            ...baseInvitation,
            campaignName: "Lanzamiento mayo",
            channel: "instagram",
            referrerHandle: "@partner",
          },
        ]}
        tribeSlug="matematica-pro"
      />
    );

    const invitationList = screen.getByRole("list", {
      name: "Invitaciones activas",
    });

    expect(within(invitationList).getByText("Instagram")).toBeInTheDocument();
    expect(
      within(invitationList).getByText("Lanzamiento mayo")
    ).toBeInTheDocument();
    expect(within(invitationList).getByText("@partner")).toBeInTheDocument();
  });

  it("edits the referral channel from the row menu", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({
        invitation: {
          ...baseInvitation,
          campaignName: "Lanzamiento mayo",
          channel: "direct",
        },
        message: "Canal actualizado.",
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

    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Editar canal" })
    );

    expect(
      await screen.findByRole("heading", { name: "Editar canal de referido" })
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Campaña"), "Lanzamiento mayo");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/invitations/invitation-1",
        expect.objectContaining({
          body: JSON.stringify({
            campaignName: "Lanzamiento mayo",
            channel: "direct",
            referrerHandle: null,
          }),
          method: "PATCH",
        })
      );
    });
    expect(toast.success).toHaveBeenCalledWith("Canal actualizado.");
    expect(
      within(
        screen.getByRole("list", { name: "Invitaciones activas" })
      ).getByText("Lanzamiento mayo")
    ).toBeInTheDocument();
  });
  it("keeps the invitation and reports the revoke fallback when the API fails without a message", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({}),
      ok: false,
    });

    render(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[baseInvitation]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(await screen.findByRole("menuitem", { name: "Revocar" }));
    await user.click(await screen.findByRole("button", { name: "Revocar link" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "No pudimos revocar la invitación."
      );
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "¿Revocar este link?" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revocar link" })).toBeEnabled();
    expect(
      within(
        screen.getByRole("list", { name: "Invitaciones activas", hidden: true })
      ).getByText("Link activo")
    ).toBeInTheDocument();
  });

  it("shows the operation fallback instead of the raw browser message when the network fails", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[baseInvitation]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Cambiar plan" })
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "No pudimos actualizar el plan asociado."
      );
    });
    expect(toast.error).not.toHaveBeenCalledWith("Failed to fetch");
    expect(
      screen.getByRole("heading", { name: "Cambiar plan asociado" })
    ).toBeInTheDocument();
  });

  it("sends a single create request when the form is submitted twice in a row", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockImplementationOnce(() => new Promise(() => {}));

    render(
      <TribeInvitationManagement
        availablePrices={[]}
        canManagePrices
        invitations={[]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: /Crear link/ }));
    await user.click((await screen.findAllByRole("combobox"))[0]);
    await user.click(await screen.findByRole("option", { name: "Plan actual" }));

    const createForm = screen
      .getByRole("button", { name: /^Crear link$/ })
      .closest("form");

    expect(createForm).not.toBeNull();

    fireEvent.submit(createForm!);
    fireEvent.submit(createForm!);

    expect(
      await screen.findByRole("button", { name: /Creando…/ })
    ).toBeDisabled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("creates the link and points to the row copy action when the clipboard is blocked", async () => {
    const user = userEvent.setup();
    const invitationUrl =
      "https://tutribu.example.com/matematica-pro/invitar/otro-token";

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new DOMException("Blocked", "NotAllowedError");
        }),
      },
    });
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({
        invitation: { ...baseInvitation, id: "invitation-2", invitationUrl },
        invitationUrl,
        message: "Link de invitación creado.",
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

    expect(screen.getByText("link activo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Crear link/ }));
    await user.click((await screen.findAllByRole("combobox"))[0]);
    await user.click(await screen.findByRole("option", { name: "Plan actual" }));
    await user.click(screen.getByRole("button", { name: /^Crear link$/ }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Link de invitación creado.", {
        description: "Copialo desde la lista cuando lo necesites.",
      });
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(await screen.findByText("links activos")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", { name: "Invitaciones activas", hidden: true })
      ).getAllByRole("button", { name: "Copiar link", hidden: true })
    ).toHaveLength(2);
  });
});
