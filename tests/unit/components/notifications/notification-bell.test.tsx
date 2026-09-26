/** Exercises the presentational bell and panel through their public props and the real Motion runtime. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it, vi } from "vitest";

import {
  NOTIFICATION_BELL_SURFACE,
  NotificationBell,
} from "@/components/notifications/notification-bell";
import { NOTIFICATION_PANEL_STATUS } from "@/components/notifications/notification-panel";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { NotificationItemResult } from "@/src/modules/notifications/application/results/notification-result";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OCCURRENCE = "2026-05-07T21:00:00.000Z";
const TRIBE = { name: "Matemática Pro", slug: "matematica-pro" };

const router = {
  back: vi.fn(),
  bfcacheId: "notification-bell-test",
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
} satisfies AppRouterInstance;

/** Mounts the production UI provider (and its Motion config) under a Next router. */
function Providers({ children }: { children: ReactNode }) {
  return (
    <AppRouterContext.Provider value={router}>
      <AppUIProvider>{children}</AppUIProvider>
    </AppRouterContext.Provider>
  );
}

function buildPromotion(id: string, eventTitle: string, readAt: string | null = null): NotificationItemResult {
  return {
    createdAt: "2026-05-06T12:00:00.000Z",
    event: { eventId: EVENT_ID, eventTitle, occurrenceStartsAt: OCCURRENCE, startsAt: OCCURRENCE },
    id,
    readAt,
    tribe: TRIBE,
    type: "event_waitlist_promoted",
  } as NotificationItemResult;
}

type BellProps = ComponentProps<typeof NotificationBell>;

function buildProps(overrides: Partial<BellProps> = {}): BellProps {
  return {
    isMarkingAll: false,
    isOpen: false,
    listStatus: NOTIFICATION_PANEL_STATUS.loaded,
    notifications: [],
    onMarkAllRead: vi.fn(),
    onOpenChange: vi.fn(),
    onRetry: vi.fn(),
    onSelectNotification: vi.fn(),
    surface: NOTIFICATION_BELL_SURFACE.popover,
    unreadCount: 0,
    ...overrides,
  };
}

function renderBell(overrides: Partial<BellProps> = {}) {
  const view = render(<NotificationBell {...buildProps(overrides)} />, { wrapper: Providers });

  return {
    ...view,
    rerenderBell: (nextOverrides: Partial<BellProps>) =>
      view.rerender(<NotificationBell {...buildProps(nextOverrides)} />),
  };
}

describe("NotificationBell", () => {
  it("caps the visible badge at 9+ while the accessible name keeps the same cap", () => {
    renderBell({ unreadCount: 12 });

    expect(screen.getByRole("button", { name: "Notificaciones, 9+ sin leer" })).toHaveTextContent("9+");
  });

  it("updates the badge and announces the count when a new notification arrives", async () => {
    const { rerenderBell } = renderBell({ unreadCount: 1 });

    rerenderBell({ unreadCount: 2 });

    expect(await screen.findByRole("button", { name: "Notificaciones, 2 sin leer" })).toHaveTextContent("2");
    expect(screen.getByRole("status")).toHaveTextContent("Notificaciones, 2 sin leer");
  });

  it("removes the badge once everything is read", async () => {
    const { rerenderBell } = renderBell({ unreadCount: 3 });
    const bell = screen.getByRole("button", { name: "Notificaciones, 3 sin leer" });

    expect(bell).toHaveTextContent("3");

    rerenderBell({ unreadCount: 0 });

    expect(screen.getByRole("button", { name: "Notificaciones" })).toBe(bell);
    await waitFor(() => expect(bell).toHaveTextContent(""));
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("adds a notification that arrives while the panel is open and keeps the existing ones", async () => {
    const first = buildPromotion("first", "Taller de álgebra");
    const second = buildPromotion("second", "Club de geometría");
    const { rerenderBell } = renderBell({ isOpen: true, notifications: [first], unreadCount: 1 });
    const panel = screen.getByRole("dialog", { name: "Notificaciones" });

    rerenderBell({ isOpen: true, notifications: [second, first], unreadCount: 2 });

    const links = await within(panel).findAllByRole("link");

    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName(/Club de geometría/);
    expect(links[1]).toHaveAccessibleName(/Taller de álgebra/);
  });

  it("drops the unread marker and the mark-all action when the last item is read", async () => {
    const unread = buildPromotion("first", "Taller de álgebra");
    const { rerenderBell } = renderBell({ isOpen: true, notifications: [unread], unreadCount: 1 });
    const panel = screen.getByRole("dialog", { name: "Notificaciones" });

    expect(within(panel).getByRole("link", { name: /Taller de álgebra/ })).toHaveAccessibleName(/^No leída:/);
    expect(within(panel).getByRole("button", { name: "Marcar todas como leídas" })).toBeInTheDocument();

    rerenderBell({
      isOpen: true,
      notifications: [buildPromotion("first", "Taller de álgebra", "2026-05-06T13:00:00.000Z")],
      unreadCount: 0,
    });

    expect(within(panel).getByRole("link", { name: /Taller de álgebra/ })).not.toHaveAccessibleName(/No leída/);
    await waitFor(() =>
      expect(within(panel).queryByRole("button", { name: "Marcar todas como leídas" })).not.toBeInTheDocument()
    );
  });

  it("replaces the loading state with the list as soon as the inbox arrives", async () => {
    const { rerenderBell } = renderBell({
      isOpen: true,
      listStatus: NOTIFICATION_PANEL_STATUS.loading,
      notifications: [],
    });
    const panel = screen.getByRole("dialog", { name: "Notificaciones" });

    expect(within(panel).getByRole("status")).toHaveTextContent("Cargando notificaciones…");

    rerenderBell({
      isOpen: true,
      listStatus: NOTIFICATION_PANEL_STATUS.loaded,
      notifications: [buildPromotion("first", "Taller de álgebra")],
      unreadCount: 1,
    });

    expect(within(panel).getByRole("link", { name: /Taller de álgebra/ })).toBeInTheDocument();
    expect(within(panel).queryByText("Cargando notificaciones…")).not.toBeInTheDocument();
  });

  it("marks one item from the list and asks the surface to retry after an error", async () => {
    const user = userEvent.setup();
    const onSelectNotification = vi.fn();
    const onRetry = vi.fn();
    const { rerenderBell } = renderBell({
      isOpen: true,
      notifications: [buildPromotion("first", "Taller de álgebra")],
      onSelectNotification,
      unreadCount: 1,
    });

    await user.click(screen.getByRole("link", { name: /Taller de álgebra/ }));
    expect(onSelectNotification).toHaveBeenCalledWith("first");

    rerenderBell({ isOpen: true, listStatus: NOTIFICATION_PANEL_STATUS.error, onRetry });
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
