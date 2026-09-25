import { buildTribeEventOccurrenceKey } from "@/src/modules/events/application/services/tribe-event-occurrences";
import {
  TRIBE_EVENT_REMINDER_BATCH,
  TRIBE_EVENT_REMINDERS,
} from "@/src/modules/events/constants/tribe-event-reminders";
import type {
  TribeEventReminderCandidate,
  TribeEventReminderRepository,
} from "@/src/modules/events/domain/repositories/tribe-event-reminder-repository";
import {
  getTribeEventReminderRange,
  selectDueTribeEventReminders,
  type TribeEventDueReminder,
} from "@/src/modules/events/domain/services/tribe-event-reminder-windows";
import { buildNotificationDedupeKey } from "@/src/modules/notifications/domain/services/notification-dedupe-key";

type SendTribeEventRemindersDependencies = {
  tribeEventReminderRepository: TribeEventReminderRepository;
};

export type SendTribeEventRemindersCommand = {
  /** Reference instant (ISO); defaults to the current time. */
  now?: string;
};

/**
 * Counters of one reminder run, logged by the cron route.
 */
export type SendTribeEventRemindersResult = {
  createdCount: number;
  dueReminderCount: number;
  /** False when the page cap stopped the run before the last series. */
  isComplete: boolean;
  pageCount: number;
  seriesCount: number;
};

type ReminderWindow = (typeof TRIBE_EVENT_REMINDERS)[number];

function toReminderCandidate(
  dueReminder: TribeEventDueReminder<ReminderWindow>
): TribeEventReminderCandidate {
  const occurrenceKey = buildTribeEventOccurrenceKey(
    dueReminder.eventId,
    dueReminder.originalStartsAt
  );

  return {
    eventId: dueReminder.eventId,
    notification: {
      dedupeKey: buildNotificationDedupeKey(dueReminder.window.type, occurrenceKey),
      payload: {
        eventId: dueReminder.eventId,
        occurrenceStartsAt: dueReminder.originalStartsAt,
        startsAt: dueReminder.startsAt,
      },
      type: dueReminder.window.type,
    },
    minimumLeadMinutes: dueReminder.window.minimumLeadMinutes,
    originalStartsAt: dueReminder.originalStartsAt,
    statuses: dueReminder.window.statuses,
    tribeId: dueReminder.tribeId,
  };
}

/**
 * Reminder job (maintenance cron, every 5 minutes): reads the series that
 * have an effective date in the reminder range (the listing applies the exact
 * occurrence predicate before its keyset limit, so series without a date in
 * the next day never consume the page cap), expands them with their exceptions
 * (like `listUpcomingTribeEvents`), and enqueues the day-before (24 h) and
 * "en 15 minutos" reminders that are due and not sent yet for the members who
 * answered. Every run sees every due occurrence again (catch-up after a late
 * or skipped run); the dedupe key `type:eventId@originalStartsAt` makes those
 * repeats, reruns, and overlapping runs idempotent. Pages are read one
 * at a time (keyset by event id) and enqueued before the next page, so memory
 * and statement size stay bounded.
 */
export function sendTribeEventReminders({
  tribeEventReminderRepository,
}: SendTribeEventRemindersDependencies) {
  return async (
    command: SendTribeEventRemindersCommand = {}
  ): Promise<SendTribeEventRemindersResult> => {
    const now = command.now ? Date.parse(command.now) : Date.now();
    const range = getTribeEventReminderRange(TRIBE_EVENT_REMINDERS, now);
    const result: SendTribeEventRemindersResult = {
      createdCount: 0,
      dueReminderCount: 0,
      isComplete: false,
      pageCount: 0,
      seriesCount: 0,
    };
    let afterEventId: string | null = null;

    while (result.pageCount < TRIBE_EVENT_REMINDER_BATCH.maxPagesPerRun) {
      const page = await tribeEventReminderRepository.listSeriesInRange({
        ...range,
        afterEventId,
        limit: TRIBE_EVENT_REMINDER_BATCH.seriesPerPage,
      });
      const dueReminders = selectDueTribeEventReminders(page.series, TRIBE_EVENT_REMINDERS, now);

      result.pageCount += 1;
      result.seriesCount += page.series.length;
      result.dueReminderCount += dueReminders.length;

      if (dueReminders.length > 0) {
        result.createdCount += await tribeEventReminderRepository.enqueueReminders(
          dueReminders.map(toReminderCandidate)
        );
      }

      if (page.nextCursor === null) {
        result.isComplete = true;

        return result;
      }

      afterEventId = page.nextCursor;
    }

    return result;
  };
}
