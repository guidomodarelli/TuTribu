import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Avatar, AvatarImage, Button, Dialog, DialogContent, DialogTitle, toast } from "beez-ui";

import { AppProviders } from "@/components/providers/app-providers";

const fetchMock = vi.fn();

describe("AppProviders", () => {
  // Sonner schedules a removal timer after a toast closes that can outlive jsdom; fake timers (advancing with real
  // time in vitest.config) keep the waits intact and restoring real timers discards the pending ones.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("should activate Next Image for shared avatars", () => {
    render(<AppProviders isSitepingEnabled={false}><Avatar><AvatarImage src="/profile.png" alt="Perfil" /></Avatar></AppProviders>);
    expect(screen.getByAltText("Perfil")).toHaveAttribute("data-nimg", "1");
    expect((screen.getByAltText("Perfil") as HTMLImageElement).src).toBe(new URL("/profile.png", window.location.href).href);
  });

  it("does not fetch Siteping identity when Siteping is disabled", () => {
    render(
      <AppProviders isSitepingEnabled={false}>
        <main>Contenido</main>
      </AppProviders>
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and its focus when a notification raised from it is closed with the keyboard", async () => {
    render(
      <AppProviders isSitepingEnabled={false}>
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Suscribirme al calendario</DialogTitle>
            <Button onClick={() => toast.success("Link listo.")}>Generar link</Button>
          </DialogContent>
        </Dialog>
      </AppProviders>
    );
    const dialog = screen.getByRole("dialog", { name: "Suscribirme al calendario" });
    const trigger = screen.getByRole("button", { name: "Generar link" });
    act(() => trigger.focus());
    act(() => trigger.click());
    await screen.findByText("Link listo.");

    const closeButton = screen.getByRole("button", { name: "Close toast" });
    act(() => closeButton.focus());
    expect(closeButton).toHaveFocus();
    act(() => closeButton.click());

    await waitFor(() => expect(screen.queryByText("Link listo.")).toBeNull());
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("fetches Siteping identity when Siteping is enabled", async () => {
    fetchMock.mockResolvedValueOnce({
      json: vi.fn(async () => ({
        enabled: false,
        identity: null,
        projectName: "tutribu",
      })),
      ok: true,
    });

    render(
      <AppProviders isSitepingEnabled>
        <main>Contenido</main>
      </AppProviders>
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/siteping/identity", { signal: expect.any(AbortSignal) })
    );
  });
});
