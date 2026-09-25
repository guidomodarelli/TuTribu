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
const SUBSCRIPTION_ID = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
const OTHER_TAB_SUBSCRIPTION_ID = "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b";

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
  subscription: { createdAt: "2026-05-01T12:00:00.000Z", id: SUBSCRIPTION_ID, lastUsedAt: null },
};

const GENERATE_SUCCESS_AFTER_CLOSE =
  "Generamos un link nuevo, pero cerraste la ventana antes de copiarlo y cualquier link anterior ya no funciona. Volvé a abrir la suscripción y regeneralo para copiarlo.";

type ToastPromiseOptions = { success: string | ((result: unknown) => string) };

/**
 * Success copy the recorded `toast.promise` call would show once its request
 * resolves, evaluated at that moment like Sonner does.
 */
async function resolvedSuccessToastCopy(callIndex = 0): Promise<string> {
  const [pendingRequest, options] = ((toast.promise as Mock).mock.calls[callIndex] ?? []) as [
    Promise<unknown>,
    ToastPromiseOptions,
  ];
  const result = await pendingRequest;

  return typeof options.success === "function" ? options.success(result) : options.success;
}

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
      expect.objectContaining({
        body: JSON.stringify({ expectedSubscriptionId: null }),
        method: "POST",
      })
    );
    expect(toast.promise).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.objectContaining({ loading: "Generando tu link…" })
    );
    await expect(resolvedSuccessToastCopy()).resolves.toBe("Link listo.");
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

  it("ignores a generate response that arrives after the dialog closed", async () => {
    const user = userEvent.setup();
    let resolveIssue: (response: Response) => void = () => undefined;

    respondWith({ subscription: null });
    (global.fetch as Mock).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveIssue = resolve;
      })
    );
    respondWith({ subscription: null });

    let dialog = await openDialog(user);

    await user.click(await within(dialog).findByRole("button", { name: "Generar link" }));
    await user.keyboard("{Escape}");
    dialog = await openDialog(user);
    await within(dialog).findByText(/Todavía no tenés un link de calendario/);

    resolveIssue(
      new Response(JSON.stringify(issuedBody), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      })
    );

    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Generar link" })).toBeEnabled());
    expect(within(dialog).queryByRole("textbox", { name: "Tu link de calendario" })).toBeNull();
    expect(within(dialog).getByText(/Todavía no tenés un link de calendario/)).toBeInTheDocument();
    // The toast must not claim the discarded link is ready to copy.
    await expect(resolvedSuccessToastCopy()).resolves.toBe(GENERATE_SUCCESS_AFTER_CLOSE);
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
    // The subscription on screen travels as the precondition.
    expect(global.fetch).toHaveBeenLastCalledWith(
      ENDPOINT,
      expect.objectContaining({
        body: JSON.stringify({ expectedSubscriptionId: SUBSCRIPTION_ID }),
        method: "POST",
      })
    );
  });

  it("reloads the state instead of showing a link when another tab already regenerated it", async () => {
    const user = userEvent.setup();
    const changedMessage =
      "Tu link de calendario cambió desde otra pestaña o dispositivo. Revisalo y volvé a intentarlo.";
    respondWith({ subscription: issuedBody.subscription });
    respondWith({ message: changedMessage }, 409);
    respondWith({
      subscription: { ...issuedBody.subscription, id: OTHER_TAB_SUBSCRIPTION_ID },
    });
    respondWith(issuedBody, 201);

    const dialog = await openDialog(user);

    await user.click(await within(dialog).findByRole("button", { name: "Regenerar link" }));
    await user.click(within(dialog).getByRole("button", { name: "Sí, regenerar" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    const [pendingRequest] = (toast.promise as Mock).mock.calls[0] ?? [];

    await expect(pendingRequest).rejects.toThrow(changedMessage);
    expect(within(dialog).queryByRole("textbox", { name: "Tu link de calendario" })).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();

    // The retry starts from the link that is active now.
    await user.click(await within(dialog).findByRole("button", { name: "Regenerar link" }));
    await user.click(within(dialog).getByRole("button", { name: "Sí, regenerar" }));

    expect(
      await within(dialog).findByRole("textbox", { name: "Tu link de calendario" })
    ).toHaveValue(FEED_URL);
    expect(global.fetch).toHaveBeenLastCalledWith(
      ENDPOINT,
      expect.objectContaining({
        body: JSON.stringify({ expectedSubscriptionId: OTHER_TAB_SUBSCRIPTION_ID }),
        method: "POST",
      })
    );
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
    await expect(resolvedSuccessToastCopy()).resolves.toBe("Suscripción desactivada.");
  });

  it("shows a safe error with a retry when the state cannot be loaded", async () => {
    const user = userEvent.setup();
    respondWith({ subscription: { createdAt: "not-a-date", id: SUBSCRIPTION_ID, lastUsedAt: null } });
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
