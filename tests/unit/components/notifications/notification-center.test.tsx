import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { toast } from "beez-ui";

import { NotificationCenter } from "@/components/notifications/notification-center";
import { NOTIFICATION_UNREAD_POLL_INTERVAL_MS } from "@/hooks/use-notification-center";
import type { NotificationInboxResponse } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";

// Preserve the existing Sonner double used by the events tests: it isolates
// Sonner's timers and global store; `promise` only records its lifecycle copy.
vi.mock("beez-ui", async () => ({
  ...(await vi.importActual<typeof import("beez-ui")>("beez-ui")),
  toast: {
    error: vi.fn(),
    promise: vi.fn(),
    success: vi.fn(),
  },
}));

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const PROPOSAL_ID = "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";
const FIRST_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const SECOND_ID = "1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const OCCURRENCE = "2026-05-07T21:00:00.000Z";

const router = {
  back: vi.fn(),
  bfcacheId: "notification-center-test",
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
} satisfies AppRouterInstance;

function RouterProvider({ children }: { children: ReactNode }) {
  return <AppRouterContext.Provider value={router}>{children}</AppRouterContext.Provider>;
}

const inbox: NotificationInboxResponse = {
  notifications: [
    {
      createdAt: "2026-05-06T12:00:00.000Z",
      event: {
        eventId: EVENT_ID,
        eventTitle: "Taller de álgebra",
        occurrenceStartsAt: OCCURRENCE,
        startsAt: OCCURRENCE,
      },
      id: FIRST_ID,
      readAt: null,
      tribe: { name: "Matemática Pro", slug: "matematica-pro" },
      type: "event_waitlist_promoted",
    },
    {
      createdAt: "2026-05-05T12:00:00.000Z",
      id: SECOND_ID,
      proposal: {
        decision: "rejected",
        eventId: null,
        eventStartsAt: null,
        proposalId: PROPOSAL_ID,
        proposalTitle: "Club de lectura",
        reviewNote: "Ya hay otro encuentro ese día",
      },
      readAt: null,
      tribe: { name: "Matemática Pro", slug: "matematica-pro" },
      type: "event_proposal_reviewed",
    },
  ],
  unreadCount: 2,
};

function respondWith(body: unknown, status = 200) {
  (global.fetch as Mock).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );
}

function renderCenter(initialInbox: NotificationInboxResponse | null = inbox) {
  return render(<NotificationCenter initialInbox={initialInbox} />, { wrapper: RouterProvider });
}

describe("NotificationCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as Mock).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the unread badge from the server inbox with an accessible count", () => {
    renderCenter();

    const bell = screen.getByRole("button", { name: "Notificaciones, 2 sin leer" });

    expect(within(bell).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Notificaciones, 2 sin leer");
  });

  it("refreshes the list on open and renders each notification with its deep link", async () => {
    const user = userEvent.setup();

    respondWith(inbox);
    renderCenter();
    await user.click(screen.getByRole("button", { name: "Notificaciones, 2 sin leer" }));

    const panel = await screen.findByRole("dialog", { name: "Notificaciones" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/notifications",
      expect.objectContaining({ cache: "no-store" })
    );

    const promoted = within(panel).getByRole("link", {
      name: /Se liberó un lugar! Ya estás confirmado en Taller de álgebra/,
    });

    expect(promoted).toHaveAttribute(
      "href",
      `/matematica-pro/eventos?event=${encodeURIComponent(`${EVENT_ID}@${OCCURRENCE}`)}`
    );
    expect(
      within(panel).getByText("Tu propuesta «Club de lectura» no fue aprobada")
    ).toBeInTheDocument();
    expect(within(panel).getByText("Nota: Ya hay otro encuentro ese día")).toBeInTheDocument();
  });

  it("marks an item as read when it is opened, without refreshing the route", async () => {
    const user = userEvent.setup();

    respondWith(inbox);
    respondWith({ unreadCount: 1 });
    renderCenter();
    await user.click(screen.getByRole("button", { name: "Notificaciones, 2 sin leer" }));

    const panel = await screen.findByRole("dialog", { name: "Notificaciones" });

    await user.click(within(panel).getByRole("link", { name: /Taller de álgebra/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notificaciones, 1 sin leer" })).toBeInTheDocument()
    );
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/notifications/${FIRST_ID}`,
      expect.objectContaining({ body: JSON.stringify({ isRead: true }), keepalive: true, method: "PATCH" })
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("marks everything as read with toast feedback and restores the inbox on failure", async () => {
    const user = userEvent.setup();

    respondWith(inbox);
    respondWith({ message: "No pudimos marcar la notificación como leída. Intentá de nuevo." }, 500);
    respondWith({ unreadCount: 0 });
    renderCenter();
    await user.click(screen.getByRole("button", { name: "Notificaciones, 2 sin leer" }));
    await user.click(await screen.findByRole("button", { name: "Marcar todas como leídas" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notificaciones, 2 sin leer" })).toBeInTheDocument()
    );
    expect(toast.promise).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Marcar todas como leídas" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notificaciones" })).toBeInTheDocument()
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/notifications/read-all",
      expect.objectContaining({ method: "POST" })
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("reconciles from the server instead of rolling back a read superseded by mark-all", async () => {
    const user = userEvent.setup();
    const readAt = "2026-05-06T13:00:00.000Z";
    let serverInbox: NotificationInboxResponse = inbox;
    let failPendingMarkRead: (response: Response) => void = () => {};

    (global.fetch as Mock).mockImplementation((url: string, init?: RequestInit) => {
      const json = (body: unknown, status = 200) =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            headers: { "Content-Type": "application/json" },
            status,
          })
        );

      if (url === "/api/notifications") {
        return json(serverInbox);
      }

      if (url === "/api/notifications/read-all") {
        serverInbox = {
          notifications: inbox.notifications.map((notification) => ({ ...notification, readAt })),
          unreadCount: 0,
        };

        return json({ unreadCount: 0 });
      }

      if (url === `/api/notifications/${FIRST_ID}` && init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          failPendingMarkRead = resolve;
        });
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });
    renderCenter();
    await user.click(screen.getByRole("button", { name: "Notificaciones, 2 sin leer" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Notificaciones" })).getByRole("link", {
        name: /Taller de álgebra/,
      })
    );
    await user.click(screen.getByRole("button", { name: "Notificaciones, 1 sin leer" }));
    await user.click(await screen.findByRole("button", { name: "Marcar todas como leídas" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notificaciones" })).toBeInTheDocument()
    );

    const inboxLoadsBeforeFailure = (global.fetch as Mock).mock.calls.filter(
      ([url]) => url === "/api/notifications"
    ).length;

    await act(async () => {
      failPendingMarkRead(
        new Response(
          JSON.stringify({ message: "No pudimos marcar la notificación como leída. Intentá de nuevo." }),
          { headers: { "Content-Type": "application/json" }, status: 500 }
        )
      );
    });

    await waitFor(() =>
      expect(
        (global.fetch as Mock).mock.calls.filter(([url]) => url === "/api/notifications").length
      ).toBe(inboxLoadsBeforeFailure + 1)
    );
    expect(screen.getByRole("button", { name: "Notificaciones" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sin leer/ })).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("defers the reconcile of a superseded read until an in-flight mark-all settles", async () => {
    const user = userEvent.setup();
    const readAt = "2026-05-06T13:00:00.000Z";
    const inboxRequestUrls: string[] = [];
    let serverInbox: NotificationInboxResponse = inbox;
    let failPendingMarkRead: (response: Response) => void = () => {};
    let settlePendingMarkAll: () => void = () => {};
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status,
      });

    (global.fetch as Mock).mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/notifications") {
        inboxRequestUrls.push(url);

        return Promise.resolve(json(serverInbox));
      }

      if (url === "/api/notifications/read-all") {
        return new Promise<Response>((resolve) => {
          settlePendingMarkAll = () => {
            serverInbox = {
              notifications: inbox.notifications.map((notification) => ({ ...notification, readAt })),
              unreadCount: 0,
            };
            resolve(json({ unreadCount: 0 }));
          };
        });
      }

      if (url === `/api/notifications/${FIRST_ID}` && init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          failPendingMarkRead = resolve;
        });
      }

      return Promise.reject(new Error(`Unexpected request ${url}`));
    });
    renderCenter();
    await user.click(screen.getByRole("button", { name: "Notificaciones, 2 sin leer" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Notificaciones" })).getByRole("link", {
        name: /Taller de álgebra/,
      })
    );
    await user.click(screen.getByRole("button", { name: "Notificaciones, 1 sin leer" }));
    await user.click(await screen.findByRole("button", { name: "Marcar todas como leídas" }));

    const inboxLoadsBeforeFailure = inboxRequestUrls.length;

    await act(async () => {
      failPendingMarkRead(json({ message: "No pudimos marcar la notificación como leída." }, 500));
    });

    expect(inboxRequestUrls).toHaveLength(inboxLoadsBeforeFailure);

    await act(async () => {
      settlePendingMarkAll();
    });

    await waitFor(() => expect(inboxRequestUrls).toHaveLength(inboxLoadsBeforeFailure + 1));
    expect(screen.getByRole("button", { name: "Notificaciones" })).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("returns focus to the bell when the panel closes", async () => {
    const user = userEvent.setup();

    respondWith(inbox);
    renderCenter();

    const bell = screen.getByRole("button", { name: "Notificaciones, 2 sin leer" });

    await user.click(bell);
    await screen.findByRole("dialog", { name: "Notificaciones" });
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bell).toHaveFocus();
  });

  it("opens a bottom sheet on narrow viewports", async () => {
    const user = userEvent.setup();
    const originalWidth = window.innerWidth;

    window.innerWidth = 375;
    respondWith(inbox);

    try {
      renderCenter();
      await user.click(screen.getByRole("button", { name: "Notificaciones, 2 sin leer" }));

      const sheet = await screen.findByRole("dialog", { name: "Notificaciones" });

      expect(sheet).toHaveAttribute("data-slot", "sheet-content");
      expect(within(sheet).getByRole("link", { name: /Taller de álgebra/ })).toBeInTheDocument();
    } finally {
      window.innerWidth = originalWidth;
    }
  });

  it("shows the empty state and a retry after a failed load", async () => {
    const user = userEvent.setup();

    respondWith({ message: "No pudimos cargar tus notificaciones. Intentá de nuevo." }, 500);
    respondWith({ notifications: [], unreadCount: 0 });
    renderCenter(null);
    await user.click(screen.getByRole("button", { name: "Notificaciones" }));

    expect(await screen.findByText("No pudimos cargar tus notificaciones.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("No tenés notificaciones.")).toBeInTheDocument();
  });

  it("polls only the unread count while the tab is visible", async () => {
    vi.useFakeTimers();
    respondWith({ unreadCount: 5 });
    renderCenter();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATION_UNREAD_POLL_INTERVAL_MS);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/notifications/unread-count",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(screen.getByRole("button", { name: "Notificaciones, 5 sin leer" })).toBeInTheDocument();
  });

  it("ignores an unusable response body instead of trusting it", async () => {
    vi.useFakeTimers();
    respondWith({ unreadCount: "muchas" });
    renderCenter();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATION_UNREAD_POLL_INTERVAL_MS);
    });

    expect(screen.getByRole("button", { name: "Notificaciones, 2 sin leer" })).toBeInTheDocument();
  });
});
