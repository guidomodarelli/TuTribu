import { describe, expect, it, vi, type Mock } from "vitest";

import { notificationInboxSchema } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";
import { PostgresNotificationRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-notification-repository";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const PROPOSAL_ID = "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";
const NOTIFICATION_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const OCCURRENCE = "2026-05-07T21:00:00.000Z";

function createExecutor(execute: Mock) {
  return async <T,>(callback: (database: never) => Promise<T>) => callback({ execute } as never);
}

/**
 * Shapes the single inbox statement result: every listed row carries the
 * unread count read in the same snapshot, and an empty inbox still returns
 * one row (all inbox columns null) so the count arrives.
 */
function createInboxResult(rows: Record<string, unknown>[], unreadCount: unknown) {
  if (rows.length === 0) {
    return { rows: [{ id: null, unread_count: unreadCount }] };
  }

  return { rows: rows.map((row) => ({ ...row, unread_count: unreadCount })) };
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
      .mockResolvedValueOnce(
        createInboxResult(
          [
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
          "1"
        )
      );
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
  });

  it("keeps the cancelled time on a cancellation notice even after the date is moved", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(
        createInboxResult(
          [
            {
              ...baseRow,
              id: NOTIFICATION_ID,
              moved_starts_at: new Date("2026-05-09T21:00:00.000Z"),
              payload: { eventId: EVENT_ID, occurrenceStartsAt: OCCURRENCE },
              type: "event_occurrence_cancelled",
            },
          ],
          1
        )
      );
    const repository = new PostgresNotificationRepository(createExecutor(execute));

    const inbox = await repository.getInbox({ limit: 30, unreadCountCap: 100 });

    expect(inbox.notifications[0]).toMatchObject({
      event: { occurrenceStartsAt: OCCURRENCE, startsAt: OCCURRENCE },
      type: "event_occurrence_cancelled",
    });
  });

  it("skips and logs notifications whose stored instants are not valid dates", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(
        createInboxResult(
          [
            {
              ...baseRow,
              id: "bad-occurrence",
              payload: { eventId: EVENT_ID, occurrenceStartsAt: "not-a-date" },
              type: "event_reminder_24h",
            },
            {
              ...baseRow,
              id: "bad-starts-at",
              payload: { eventId: EVENT_ID, occurrenceStartsAt: OCCURRENCE, startsAt: "2026-13-45" },
              type: "event_occurrence_moved",
            },
            {
              ...baseRow,
              id: NOTIFICATION_ID,
              payload: { eventId: EVENT_ID, occurrenceStartsAt: OCCURRENCE, startsAt: OCCURRENCE },
              type: "event_reminder_15m",
            },
          ],
          3
        )
      );
    const logger = { warn: vi.fn() };
    const repository = new PostgresNotificationRepository(createExecutor(execute), { logger });

    const inbox = await repository.getInbox({ limit: 30, unreadCountCap: 100 });

    expect(inbox.notifications.map((notification) => notification.id)).toEqual([NOTIFICATION_ID]);
    expect(inbox.unreadCount).toBe(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining("invalid instant"),
      metadata: { field: "occurrenceStartsAt", notificationId: "bad-occurrence", type: "event_reminder_24h" },
    });
    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining("invalid instant"),
      metadata: { field: "startsAt", notificationId: "bad-starts-at", type: "event_occurrence_moved" },
    });
  });

  it("skips a shaped but impossible occurrence instant instead of letting its SQL cast fail the inbox", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(
        createInboxResult(
          [
            {
              ...baseRow,
              id: "impossible-occurrence",
              payload: { eventId: EVENT_ID, occurrenceStartsAt: "2026-99-99T12:00:00Z" },
              type: "event_waitlist_promoted",
            },
          ],
          1
        )
      );
    const logger = { warn: vi.fn() };
    const repository = new PostgresNotificationRepository(createExecutor(execute), { logger });

    const inbox = await repository.getInbox({ limit: 30, unreadCountCap: 100 });

    expect(inbox.notifications).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining("invalid instant"),
      metadata: {
        field: "occurrenceStartsAt",
        notificationId: "impossible-occurrence",
        type: "event_waitlist_promoted",
      },
    });
  });

  it("skips and logs notifications whose payload ids are not UUIDs so the public inbox still parses", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(
        createInboxResult(
          [
            {
              ...baseRow,
              id: "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
              payload: { eventId: "not-a-uuid", occurrenceStartsAt: OCCURRENCE },
              type: "event_reminder_24h",
            },
            {
              ...baseRow,
              id: "7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b",
              payload: { decision: "rejected", proposalId: "11111111-1111-1111-1111-111111111111" },
              type: "event_proposal_reviewed",
            },
            {
              ...baseRow,
              event_starts_at: "2026-05-20T21:00:00.000Z",
              id: PROPOSAL_ID,
              payload: { decision: "approved", eventId: "event-42", proposalId: PROPOSAL_ID },
              type: "event_proposal_reviewed",
            },
            {
              ...baseRow,
              id: NOTIFICATION_ID,
              payload: { eventId: EVENT_ID, occurrenceStartsAt: OCCURRENCE },
              type: "event_reminder_15m",
            },
          ],
          4
        )
      );
    const logger = { warn: vi.fn() };
    const repository = new PostgresNotificationRepository(createExecutor(execute), { logger });

    const inbox = await repository.getInbox({ limit: 30, unreadCountCap: 100 });

    expect(inbox.notifications.map((notification) => notification.id)).toEqual([
      PROPOSAL_ID,
      NOTIFICATION_ID,
    ]);
    expect(inbox.notifications[0]).toMatchObject({
      proposal: { eventId: null, eventStartsAt: null, proposalId: PROPOSAL_ID },
    });
    expect(notificationInboxSchema.safeParse(inbox).success).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining("invalid id"),
      metadata: {
        field: "eventId",
        notificationId: "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
        type: "event_reminder_24h",
      },
    });
    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining("invalid id"),
      metadata: {
        field: "proposalId",
        notificationId: "7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b",
        type: "event_proposal_reviewed",
      },
    });
    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining("invalid id"),
      metadata: { field: "eventId", notificationId: PROPOSAL_ID, type: "event_proposal_reviewed" },
    });
  });

  it("returns the unread count of an inbox whose list is empty", async () => {
    const execute = vi.fn().mockResolvedValueOnce(createInboxResult([], "0"));
    const repository = new PostgresNotificationRepository(createExecutor(execute));

    await expect(repository.getInbox({ limit: 30, unreadCountCap: 100 })).resolves.toEqual({
      notifications: [],
      unreadCount: 0,
    });
  });

  it("excludes rows the inbox cannot show from the unread count", async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [{ unread_count: 2 }] });
    const repository = new PostgresNotificationRepository(createExecutor(execute));

    await expect(repository.countUnread({ unreadCountCap: 100 })).resolves.toBe(2);
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
  });
});
