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

  it("creates a reusable invitation link and copies it", async () => {
    const user = userEvent.setup();
    const invitationUrl =
      "https://tutribu.example.com/tribu/matematica-pro/invitar/token";

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        invitation: {
          createdAt: "2026-04-26T07:00:00.000Z",
          createdByName: "Grace Hopper",
          id: "invitation-1",
          invitationUrl,
        },
        invitationUrl,
        message: "Link de invitación creado.",
      }),
      ok: true,
    });

    render(
      <TribeInvitationManagement
        invitations={[]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Crear link" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/invitations",
      { method: "POST" }
    );
    expect(screen.getByText("Link activo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Link de invitación creado.");
  });

  it("revokes an active invitation", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        message: "Invitación revocada.",
      }),
      ok: true,
    });

    render(
      <TribeInvitationManagement
        invitations={[
          {
            createdAt: "2026-04-26T07:00:00.000Z",
            createdByName: "Grace Hopper",
            id: "invitation-1",
            invitationUrl:
              "https://tutribu.example.com/tribu/matematica-pro/invitar/token",
          },
        ]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Revocar" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/invitations/invitation-1",
        { method: "DELETE" }
      );
    });
    expect(screen.getByText("Todavía no hay invitaciones activas.")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Invitación revocada.");
  });

  it("copies the invitation URL from the selected active row", async () => {
    const user = userEvent.setup();
    const clipboardWriteTextSpy = jest
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    const firstInvitationUrl =
      "https://tutribu.example.com/tribu/matematica-pro/invitar/first-token";
    const secondInvitationUrl =
      "https://tutribu.example.com/tribu/matematica-pro/invitar/second-token";

    render(
      <TribeInvitationManagement
        invitations={[
          {
            createdAt: "2026-04-26T07:00:00.000Z",
            createdByName: "Grace Hopper",
            id: "invitation-1",
            invitationUrl: firstInvitationUrl,
          },
          {
            createdAt: "2026-04-26T07:01:00.000Z",
            createdByName: "Grace Hopper",
            id: "invitation-2",
            invitationUrl: secondInvitationUrl,
          },
        ]}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getAllByRole("button", { name: "Copiar link" })[1]);

    await waitFor(() => {
      expect(clipboardWriteTextSpy).toHaveBeenCalledWith(secondInvitationUrl);
    });
    expect(clipboardWriteTextSpy).not.toHaveBeenCalledWith(firstInvitationUrl);
  });
});
