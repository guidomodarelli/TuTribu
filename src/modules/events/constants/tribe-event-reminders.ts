import { NOTIFICATION_TYPE } from "@/src/modules/notifications/constants/notifications";

import { TRIBE_EVENT_ATTENDANCE_STATUS } from "./tribe-events";

/**
 * Event reminders sent by the maintenance cron (every 5 minutes, see
 * `vercel.json` and `wrangler.jsonc`). Each reminder fires for occurrences
 * whose effective start is `leadMinutes` ahead, give or take
 * `toleranceMinutes`: the window is wider than the cron period so a late or
 * skipped tick (jitter) never loses a reminder, and the dedupe key
 * (`type:eventId@originalStartsAt`, unique per recipient) keeps it to one
 * notification however many runs see the occurrence.
 *
 * Audience decision: the day-before reminder goes to "Voy" and "Tal vez"
 * (a nudge helps undecided members plan); the 15-minute reminder only to
 * "Voy" (it is a "starting now" call to join). Waitlisted members get
 * neither: they hold no seat, and a promotion notifies them separately.
 */
export const TRIBE_EVENT_REMINDER = {
  dayBefore: {
    leadMinutes: 1440,
    statuses: [TRIBE_EVENT_ATTENDANCE_STATUS.going, TRIBE_EVENT_ATTENDANCE_STATUS.maybe],
    toleranceMinutes: 10,
    type: NOTIFICATION_TYPE.eventReminderDayBefore,
  },
  soon: {
    leadMinutes: 15,
    statuses: [TRIBE_EVENT_ATTENDANCE_STATUS.going],
    toleranceMinutes: 5,
    type: NOTIFICATION_TYPE.eventReminderSoon,
  },
} as const;

export const TRIBE_EVENT_REMINDERS = [TRIBE_EVENT_REMINDER.dayBefore, TRIBE_EVENT_REMINDER.soon] as const;

/**
 * Bounded processing per cron run: series are read in keyset pages so one
 * run never loads every series of the platform at once (at most
 * `maxPagesPerRun * seriesPerPage` series with a date in the next day). A run
 * that hits the page cap reports `isComplete: false` in its structured log:
 * that is the signal to raise the cap or shard the cron before reminders of
 * the remaining series are skipped.
 */
export const TRIBE_EVENT_REMINDER_BATCH = {
  maxPagesPerRun: 10,
  seriesPerPage: 200,
} as const;
