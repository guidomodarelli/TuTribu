"use client";

import { useState } from "react";
import { useIsMobile } from "beez-ui";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { useNotificationCenter } from "@/hooks/use-notification-center";
import type { NotificationInboxResponse } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";

type NotificationCenterProps = {
  /** Inbox rendered on the server by the platform layout (null on failure). */
  initialInbox: NotificationInboxResponse | null;
};

/**
 * Client container of the header bell: owns the inbox state (initial inbox
 * from the server, refresh on open, unread polling) and the read marks, and
 * renders the presentational bell. Selecting an item marks it as read and
 * closes the surface while the link navigates to the event.
 */
export function NotificationCenter({ initialInbox }: NotificationCenterProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const center = useNotificationCenter(initialInbox);

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
      isMobile={isMobile}
      isOpen={isOpen}
      listStatus={center.listStatus}
      notifications={center.notifications}
      onMarkAllRead={() => void center.markAllRead()}
      onOpenChange={handleOpenChange}
      onRetry={center.refreshList}
      onSelectNotification={handleSelectNotification}
      unreadCount={center.unreadCount}
    />
  );
}
