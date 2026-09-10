import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "beez-ui";

import { TribeSupportConfigDialog } from "@/components/tribes/tribe-support-config-dialog";
import { TRIBE_SUPPORT_CHANNEL } from "@/src/modules/tribes/constants/tribe-support";

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const fetchMock = vi.fn();

describe("TribeSupportConfigDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("submits the form and reports the saved settings on success", async () => {
    const handleSaved = vi.fn();
    const handleOpenChange = vi.fn();

    fetchMock.mockResolvedValueOnce({
      json: vi.fn(async () => ({
        message: "Botón de soporte actualizado.",
        settings: {
          channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
          message: "Hola",
          phoneNumber: "+54 9 11 1234 5678",
        },
      })),
      ok: true,
    });

    render(
      <TribeSupportConfigDialog
        initialSettings={null}
        onOpenChange={handleOpenChange}
        onSaved={handleSaved}
        open
        tribeSlug="tribu-lider"
      />
    );

    await userEvent.type(
      screen.getByLabelText(/Número de WhatsApp/i),
      "+54 9 11 1234 5678"
    );
    await userEvent.type(
      screen.getByLabelText(/Mensaje personalizado/i),
      "Hola"
    );

    await userEvent.click(screen.getByRole("button", { name: /Guardar/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tribes/tribu-lider/support",
      expect.objectContaining({
        method: "PUT",
      })
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(JSON.parse(requestInit.body)).toEqual({
      channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
      message: "Hola",
      phoneNumber: "+54 9 11 1234 5678",
    });

    expect(handleSaved).toHaveBeenCalledWith({
      channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
      message: "Hola",
      phoneNumber: "+54 9 11 1234 5678",
    });
    expect(toast.success).toHaveBeenCalledWith("Botón de soporte actualizado.");
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the error message near the phone input when the server rejects the save", async () => {
    fetchMock.mockResolvedValueOnce({
      json: vi.fn(async () => ({
        message:
          "Ingresá un número válido en formato internacional (ej.: +54 9 11 1234 5678).",
      })),
      ok: false,
    });

    render(
      <TribeSupportConfigDialog
        initialSettings={null}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        open
        tribeSlug="tribu-lider"
      />
    );

    await userEvent.type(screen.getByLabelText(/Número de WhatsApp/i), "abc");
    await userEvent.click(screen.getByRole("button", { name: /Guardar/i }));

    expect(
      await screen.findByText(
        /Ingresá un número válido en formato internacional/i
      )
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
