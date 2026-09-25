import { describe, expect, it, vi, type Mock } from "vitest";

import { PostgresNotificationRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-notification-repository";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const PROPOSAL_ID = "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";
const NOTIFICATION_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const OCCURRENCE = "2026-05-07T21:00:00.000Z";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (chunk && typeof chunk === "object" && "value" in chunk && Array.isArray((chunk as { value: unknown }).value)) {
        return (chunk as { value: string[] }).value.join("");
      }

      if (chunk && typeof chunk === "object" && "queryChunks" in chunk) {
        return getSqlText(chunk);
      }

      return "";
    })
    .join("");
}

function createExecutor(execute: Mock) {
  return async <T,>(callback: (database: never) => Promise<T>) => callback({ execute } as never);
}

const baseRow = {
  created_at: new Date("2026-05-06T12:00:00.000Z"),
  event_starts_at: null,
  event_title: "Taller semanal",
  moved_starts_at: null,
  proposal_review_note: null,
  proposal_title: null,
  read_at: null,
  tribe_name: "Matemática Pro",
  tribe_slug: "matematica-pro",
};

describe("PostgresNotificationRepository", () => {
  it("reads only own notifications of readable tribes and resolves the display facts", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...baseRow,
            id: NOTIFICATION_ID,
            moved_starts_at: new Date("2026-05-08T21:00:00.000Z"),
            payload: { eventId: EVENT_ID, occurrenceStartsAt: OCCURRENCE },
            type: "event_waitlist_promoted",
          },
          {
            ...baseRow,
            event_starts_at: "2026-05-20T21:00:00.000Z",
            event_title: null,
            id: PROPOSAL_ID,
            payload: { decision: "approved", eventId: EVENT_ID, proposalId: PROPOSAL_ID },
            proposal_review_note: "¡Buena idea!",
            proposal_title: "Club de lectura",
            read_at: "2026-05-06T13:00:00.000Z",
            type: "event_proposal_reviewed",
          },
          { ...baseRow, id: "x", payload: {}, type: "unknown_type" },
          { ...baseRow, id: "y", payload: { eventId: EVENT_ID }, type: "event_occurrence_cancelled" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ unread_count: "1" }] });
    const repository = new PostgresNotificationRepository(createExecutor(execute));

    const inbox = await repository.getInbox({ limit: 30, unreadCountCap: 100 });

    expect(inbox).toEqual({
      notifications: [
        {
          createdAt: "2026-05-06T12:00:00.000Z",
          event: {
            eventId: EVENT_ID,
            eventTitle: "Taller semanal",
            occurrenceStartsAt: OCCURRENCE,
            startsAt: "2026-05-08T21:00:00.000Z",
          },
          id: NOTIFICATION_ID,
          readAt: null,
          tribe: { name: "Matemática Pro", slug: "matematica-pro" },
          type: "event_waitlist_promoted",
        },
        {
          createdAt: "2026-05-06T12:00:00.000Z",
          id: PROPOSAL_ID,
          proposal: {
            decision: "approved",
            eventId: EVENT_ID,
            eventStartsAt: "2026-05-20T21:00:00.000Z",
            proposalId: PROPOSAL_ID,
            proposalTitle: "Club de lectura",
            reviewNote: "¡Buena idea!",
          },
          readAt: "2026-05-06T13:00:00.000Z",
          tribe: { name: "Matemática Pro", slug: "matematica-pro" },
          type: "event_proposal_reviewed",
        },
      ],
      unreadCount: 1,
    });

    const listSql = getSqlText(execute.mock.calls[0]?.[0]);
    const countSql = getSqlText(execute.mock.calls[1]?.[0]);

    expect(listSql).toContain("notifications.recipient_user_id = public.current_app_user_id()");
    expect(listSql).toContain("public.can_read_tribe_content(notifications.tribe_id)");
    expect(countSql).toContain("notifications.read_at is null");
  });

  it("marks an own notification and reports not found for anyone else's", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ is_found: true }] })
      .mockResolvedValueOnce({ rows: [{ unread_count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ is_found: false }] });
    const repository = new PostgresNotificationRepository(createExecutor(execute));

    await expect(
      repository.markRead({ notificationId: NOTIFICATION_ID, unreadCountCap: 100 })
    ).resolves.toEqual({ status: "marked", unreadCount: 0 });
    await expect(
      repository.markRead({ notificationId: NOTIFICATION_ID, unreadCountCap: 100 })
    ).resolves.toEqual({ status: "not_found" });

    const markSql = getSqlText(execute.mock.calls[0]?.[0]);

    expect(markSql).toContain("notifications.recipient_user_id = public.current_app_user_id()");
    expect(markSql).toContain("notifications.read_at is null");
  });

  it("marks every unread notification of the user", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ marked_count: 4 }] })
      .mockResolvedValueOnce({ rows: [{ unread_count: 0 }] });
    const repository = new PostgresNotificationRepository(createExecutor(execute));

    await expect(repository.markAllRead({ unreadCountCap: 100 })).resolves.toEqual({
      markedCount: 4,
      unreadCount: 0,
    });
  });

  it("purges one bounded batch of old read notifications", async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [{ deleted_count: "12" }] });
    const repository = new PostgresNotificationRepository(createExecutor(execute));

    await expect(
      repository.purgeReadBatch({ batchSize: 1000, readBefore: "2026-02-05T12:00:00.000Z" })
    ).resolves.toBe(12);

    const purgeSql = getSqlText(execute.mock.calls[0]?.[0]);

    expect(purgeSql).toContain("public.purge_read_notifications(");
    expect(purgeSql).not.toContain("delete from public.notifications");
  });
});
