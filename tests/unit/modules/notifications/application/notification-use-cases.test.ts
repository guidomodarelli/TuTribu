import { describe, expect, it, vi } from "vitest";

import {
  getNotificationInbox,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  purgeReadNotifications,
} from "@/src/modules/notifications/application/use-cases/notification-use-cases";
import {
  NOTIFICATION_INBOX,
  NOTIFICATION_RETENTION,
} from "@/src/modules/notifications/constants/notifications";
import type { NotificationRepository } from "@/src/modules/notifications/domain/repositories/notification-repository";

const NOTIFICATION_ID = "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";

function createRepositoryDouble(overrides: Partial<NotificationRepository> = {}) {
  return {
    countUnread: vi.fn(async () => 3),
    getInbox: vi.fn(async () => ({ notifications: [], unreadCount: 0 })),
    markAllRead: vi.fn(async () => ({ markedCount: 2, unreadCount: 0 })),
    markRead: vi.fn(async () => ({ status: "marked" as const, unreadCount: 1 })),
    purgeReadBatch: vi.fn(async () => 0),
    ...overrides,
  } satisfies NotificationRepository;
}

describe("notification use cases", () => {
  it("reads the inbox with the list size and the unread cap", async () => {
    const notificationRepository = createRepositoryDouble();

    await expect(getNotificationInbox({ notificationRepository })()).resolves.toEqual({
      notifications: [],
      unreadCount: 0,
    });
    expect(notificationRepository.getInbox).toHaveBeenCalledWith({
      limit: NOTIFICATION_INBOX.listLimit,
      unreadCountCap: NOTIFICATION_INBOX.unreadCountCap,
    });
  });

  it("returns only the unread count on the polling path", async () => {
    const notificationRepository = createRepositoryDouble();

    await expect(getUnreadNotificationCount({ notificationRepository })()).resolves.toEqual({
      unreadCount: 3,
    });
  });

  it("marks one notification and forwards the fresh count or the not-found status", async () => {
    const notificationRepository = createRepositoryDouble();

    await expect(
      markNotificationRead({ notificationRepository })({ notificationId: NOTIFICATION_ID })
    ).resolves.toEqual({ status: "marked", unreadCount: 1 });

    const missingRepository = createRepositoryDouble({
      markRead: vi.fn(async () => ({ status: "not_found" as const })),
    });

    await expect(
      markNotificationRead({ notificationRepository: missingRepository })({
        notificationId: NOTIFICATION_ID,
      })
    ).resolves.toEqual({ status: "not_found" });
  });

  it("marks every notification and returns the unread count", async () => {
    const notificationRepository = createRepositoryDouble();

    await expect(markAllNotificationsRead({ notificationRepository })()).resolves.toEqual({
      unreadCount: 0,
    });
  });

  it("purges read notifications older than the retention in bounded batches", async () => {
    const notificationRepository = createRepositoryDouble({
      purgeReadBatch: vi
        .fn()
        .mockResolvedValueOnce(NOTIFICATION_RETENTION.purgeBatchSize)
        .mockResolvedValueOnce(7),
    });

    const result = await purgeReadNotifications({ notificationRepository })({
      now: "2026-05-06T12:00:00.000Z",
    });

    expect(notificationRepository.purgeReadBatch).toHaveBeenCalledWith({
      batchSize: NOTIFICATION_RETENTION.purgeBatchSize,
      readBefore: "2026-02-05T12:00:00.000Z",
    });
    expect(result).toEqual({
      batchCount: 2,
      isComplete: true,
      purgedCount: NOTIFICATION_RETENTION.purgeBatchSize + 7,
    });
  });

  it("stops after the batch cap and reports the purge as incomplete", async () => {
    const notificationRepository = createRepositoryDouble({
      purgeReadBatch: vi.fn(async () => NOTIFICATION_RETENTION.purgeBatchSize),
    });

    const result = await purgeReadNotifications({ notificationRepository })();

    expect(notificationRepository.purgeReadBatch).toHaveBeenCalledTimes(
      NOTIFICATION_RETENTION.maxBatchesPerRun
    );
    expect(result.isComplete).toBe(false);
  });
});
