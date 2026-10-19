import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Avatar, Button, Dialog, DialogContent, toast } from "@golfo/ui";

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
    render(<AppProviders isSitepingEnabled={false}><Avatar name="Perfil" src="/profile.png" /></AppProviders>);
    // The avatar is announced once by its root; the photo inside it is decorative.
    const photo = screen.getByRole("img", { name: "Perfil" }).querySelector("img");
    expect(photo).toHaveAttribute("data-nimg", "1");
    expect(photo?.src).toBe(new URL("/profile.png", window.location.href).href);
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
          <DialogContent title="Suscribirme al calendario">
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
