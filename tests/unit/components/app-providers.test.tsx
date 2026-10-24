import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Avatar, Button, Dialog, DialogContent, toast } from "@golfo/ui";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/app-providers";
import { APP_TOAST_DURATION_MS } from "@/src/constants/toast";

/** Sonner closes a toast after this time when no duration is configured. */
const SONNER_DEFAULT_DURATION_MS = 4_000;

const fetchMock = vi.fn();

/** Supplies the real ordinary-route context required before optional reporting can classify a location. */
function RouteContext({ children }: { children: ReactNode }) {
  return <PathnameContext.Provider value="/synthetic-tribe"><SearchParamsContext.Provider value={new URLSearchParams()}>{children}</SearchParamsContext.Provider></PathnameContext.Provider>;
}

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
    render(<RouteContext><AppProviders isSitepingEnabled={false}><Avatar name="Perfil" src="/profile.png" /></AppProviders></RouteContext>);
    // The avatar is announced once by its root; the photo inside it is decorative.
    const photo = screen.getByRole("img", { name: "Perfil" }).querySelector("img");
    expect(photo).toHaveAttribute("data-nimg", "1");
    expect(photo?.src).toBe(new URL("/profile.png", window.location.href).href);
  });

  it("does not fetch Siteping identity when Siteping is disabled", () => {
    render(
      <RouteContext><AppProviders isSitepingEnabled={false}>
        <main>Contenido</main>
      </AppProviders></RouteContext>
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and its focus when a notification raised from it is closed with the keyboard", async () => {
    render(
      <RouteContext><AppProviders isSitepingEnabled={false}>
        <Dialog defaultOpen>
          <DialogContent title="Suscribirme al calendario">
            <Button onClick={() => toast.success("Link listo.")}>Generar link</Button>
          </DialogContent>
        </Dialog>
      </AppProviders></RouteContext>
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
      <RouteContext><AppProviders isSitepingEnabled>
        <main>Contenido</main>
      </AppProviders></RouteContext>
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/siteping/identity", { signal: expect.any(AbortSignal) })
    );
  });

  it("keeps a notification readable past Sonner's default and closes it after the application duration", async () => {
    render(<RouteContext><AppProviders isSitepingEnabled={false}><Button onClick={() => toast.success("Prueba enviada.")}>Enviar</Button></AppProviders></RouteContext>);
    act(() => screen.getByRole("button", { name: "Enviar" }).click());
    await screen.findByText("Prueba enviada.");

    await act(async () => { await vi.advanceTimersByTimeAsync(SONNER_DEFAULT_DURATION_MS + 1_000); });
    expect(screen.getByText("Prueba enviada.")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(APP_TOAST_DURATION_MS); });
    await waitFor(() => expect(screen.queryByText("Prueba enviada.")).not.toBeInTheDocument());
  });
});
