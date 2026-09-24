import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { toast } from "beez-ui";

import { TribeEventsCalendar } from "@/components/events/tribe-events-calendar";

// Preserve the existing Sonner double to isolate its timers and global
// notification store; `promise` only records the lifecycle copy it receives.
vi.mock("beez-ui", async () => ({
  ...(await vi.importActual<typeof import("beez-ui")>("beez-ui")),
  toast: {
    error: vi.fn(),
    promise: vi.fn(),
    success: vi.fn(),
  },
}));

const MAY = { current: "2026-05", next: "2026-06", previous: "2026-04" };
const MEMBER = { canManageEvents: false, canProposeEvents: true };
const TRIBE_SLUG = "matematica-pro";
const FEED_URL =
  "https://tutribu.example.com/api/calendar/tribes/matematica-pro/feed/Zx8_Qm-3kP0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV.ics";
const ENDPOINT = "/api/tribes/matematica-pro/events/calendar-feed";

const router = {
  back: vi.fn(),
  bfcacheId: "tribe-calendar-feed-test",
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
} satisfies AppRouterInstance;

function RouterProvider({ children }: { children: ReactNode }) {
  return <AppRouterContext.Provider value={router}>{children}</AppRouterContext.Provider>;
}

function renderCalendar() {
  return render(
    <TribeEventsCalendar
      events={[]}
      month={MAY}
      tribeSlug={TRIBE_SLUG}
      viewerPermissions={MEMBER}
    />,
    { wrapper: RouterProvider }
  );
}

function respondWith(body: unknown, status = 200) {
  (global.fetch as Mock).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );
}

const issuedBody = {
  feedUrl: FEED_URL,
  message: "Tu link de calendario está listo. Copialo ahora: no lo vamos a volver a mostrar.",
  subscription: { createdAt: "2026-05-01T12:00:00.000Z", lastUsedAt: null },
};

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  if (!screen.queryByRole("button", { name: "Suscribirme al calendario" })) {
    renderCalendar();
  }

  await user.click(screen.getByRole("button", { name: "Suscribirme al calendario" }));

  return screen.findByRole("dialog", { name: "Suscribirme al calendario" });
}

describe("TribeEventsCalendar calendar subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    window.history.replaceState(null, "", "/matematica-pro/eventos");
  });

  it("explains the personal link and generates it once, with copy and calendar app links", async () => {
    const user = userEvent.setup();
    respondWith({ subscription: null });
    respondWith(issuedBody, 201);

    const dialog = await openDialog(user);

    expect(
      await within(dialog).findByText(/El link es personal: no lo compartas/)
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({ cache: "no-store" }));

    await user.click(within(dialog).getByRole("button", { name: "Generar link" }));

    const linkField = await within(dialog).findByRole("textbox", { name: "Tu link de calendario" });

    expect(linkField).toHaveValue(FEED_URL);
    expect(linkField).toHaveAttribute("readonly");
    expect(global.fetch).toHaveBeenLastCalledWith(
      ENDPOINT,
      expect.objectContaining({ method: "POST" })
    );
    expect(toast.promise).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.objectContaining({ loading: "Generando tu link…" })
    );
    expect(within(dialog).getByRole("link", { name: "Abrir en Apple Calendar" })).toHaveAttribute(
      "href",
      FEED_URL.replace("https://", "webcal://")
    );

    const googleLink = within(dialog).getByRole("link", { name: "Agregar a Google Calendar" });

    expect(new URL(googleLink.getAttribute("href") ?? "").searchParams.get("cid")).toBe(FEED_URL);
    expect(googleLink).toHaveAttribute("rel", "noopener noreferrer");

    await user.click(within(dialog).getByRole("button", { name: "Copiar" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Link copiado."));
    await expect(navigator.clipboard.readText()).resolves.toBe(FEED_URL);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("forgets the link when the dialog closes: it is shown only once", async () => {
    const user = userEvent.setup();
    respondWith({ subscription: null });
    respondWith(issuedBody, 201);
    respondWith({ subscription: issuedBody.subscription });

    let dialog = await openDialog(user);

    await user.click(await within(dialog).findByRole("button", { name: "Generar link" }));
    await within(dialog).findByRole("textbox", { name: "Tu link de calendario" });
    await user.keyboard("{Escape}");
    dialog = await openDialog(user);

    expect(await within(dialog).findByText(/Tenés una suscripción activa/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox", { name: "Tu link de calendario" })).toBeNull();
  });

  it("asks for confirmation before regenerating because the old link stops working", async () => {
    const user = userEvent.setup();
    respondWith({ subscription: issuedBody.subscription });
    respondWith(issuedBody, 201);

    const dialog = await openDialog(user);

    await user.click(await within(dialog).findByRole("button", { name: "Regenerar link" }));

    expect(
      within(dialog).getByText(/El link anterior va a dejar de funcionar/)
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole("button", { name: "Sí, regenerar" }));

    expect(
      await within(dialog).findByRole("textbox", { name: "Tu link de calendario" })
    ).toHaveValue(FEED_URL);
  });

  it("turns the subscription off without refreshing the route", async () => {
    const user = userEvent.setup();
    respondWith({ subscription: issuedBody.subscription });
    respondWith({
      message: "Suscripción desactivada. El link anterior ya no funciona.",
      subscription: null,
    });

    const dialog = await openDialog(user);

    await user.click(await within(dialog).findByRole("button", { name: "Desactivar suscripción" }));

    expect(await within(dialog).findByRole("button", { name: "Generar link" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenLastCalledWith(
      ENDPOINT,
      expect.objectContaining({ method: "DELETE" })
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows a safe error with a retry when the state cannot be loaded", async () => {
    const user = userEvent.setup();
    respondWith({ subscription: { createdAt: "not-a-date", lastUsedAt: null } });
    respondWith({ subscription: null });

    const dialog = await openDialog(user);

    expect(
      await within(dialog).findByText("No pudimos cargar tu suscripción al calendario.")
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Reintentar" }));

    expect(await within(dialog).findByRole("button", { name: "Generar link" })).toBeInTheDocument();
  });

  it("keeps the dialog usable and reports the failure when generating fails", async () => {
    const user = userEvent.setup();
    respondWith({ subscription: null });
    respondWith({ message: "Solo los miembros de la tribu pueden suscribirse a su calendario." }, 403);

    const dialog = await openDialog(user);

    await user.click(await within(dialog).findByRole("button", { name: "Generar link" }));

    await waitFor(() => expect(toast.promise).toHaveBeenCalled());
    const [pendingRequest] = (toast.promise as Mock).mock.calls[0] ?? [];

    await expect(pendingRequest).rejects.toThrow(
      "Solo los miembros de la tribu pueden suscribirse a su calendario."
    );
    expect(within(dialog).queryByRole("textbox", { name: "Tu link de calendario" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Generar link" })).toBeEnabled();
  });
});
