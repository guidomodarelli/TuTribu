"use client";

import { useState } from "react";
import { useIsMobile, useIsHydrated } from "@golfo/ui/hooks";

import {
  NOTIFICATION_BELL_SURFACE,
  NotificationBell,
  type NotificationBellSurface,
} from "@/components/notifications/notification-bell";
import { useNotificationCenter } from "@/hooks/use-notification-center";
import type { NotificationInboxResponse } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";

type NotificationCenterProps = {
  /** Inbox rendered on the server by the platform layout (null on failure). */
  initialInbox: NotificationInboxResponse | null;
};

/**
 * Both surfaces until hydration, then the sheet on mobile and the popover
 * otherwise.
 */
function resolveBellSurface(isHydrated: boolean, isMobile: boolean): NotificationBellSurface {
  if (!isHydrated) {
    return NOTIFICATION_BELL_SURFACE.responsive;
  }

  return isMobile ? NOTIFICATION_BELL_SURFACE.sheet : NOTIFICATION_BELL_SURFACE.popover;
}

/**
 * Client container of the header bell: owns the inbox state (initial inbox
 * from the server, refresh on open, unread polling) and the read marks, and
 * renders the presentational bell. Selecting an item marks it as read and
 * closes the surface while the link navigates to the event.
 */
export function NotificationCenter({ initialInbox }: NotificationCenterProps) {
  const isMobile = useIsMobile();
  const isHydrated = useIsHydrated();
  // `useIsMobile` is `false` on the server: ship both surfaces until hydration
  // (CSS picks one) so a mobile first load never swaps Popover for Sheet.
  const surface = resolveBellSurface(isHydrated, isMobile);
  const [isOpen, setIsOpen] = useState(false);
  const center = useNotificationCenter(initialInbox, { isOpen });

  const handleOpenChange = (nextIsOpen: boolean) => {
    setIsOpen(nextIsOpen);

    if (nextIsOpen) {
      center.refreshList();
    }
  };

  const handleSelectNotification = (notificationId: string) => {
    center.markRead(notificationId);
    setIsOpen(false);
  };

  return (
    <NotificationBell
      isMarkingAll={center.isMarkingAll}
      isOpen={isOpen}
      listStatus={center.listStatus}
      notifications={center.notifications}
      refreshUnavailable={center.refreshUnavailable}
      onMarkAllRead={() => void center.markAllRead()}
      onOpenChange={handleOpenChange}
      onRetry={center.refreshList}
      onSelectNotification={handleSelectNotification}
      surface={surface}
      unreadCount={center.unreadCount}
    />
  );
}
