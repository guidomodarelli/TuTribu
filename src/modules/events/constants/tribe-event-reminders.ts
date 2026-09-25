import { NOTIFICATION_TYPE } from "@/src/modules/notifications/constants/notifications";

import { TRIBE_EVENT_ATTENDANCE_STATUS } from "./tribe-events";

/**
 * Event reminders sent by the maintenance cron (every 5 minutes: GitHub
 * Actions `.github/workflows/event-reminders-cron.yml` for the Vercel target,
 * `wrangler.jsonc` for Cloudflare). A reminder is "due and not sent yet":
 * it fires for every occurrence whose effective start falls in
 * `(now + minimumLeadMinutes, now + leadMinutes]`, so a scheduler run that is
 * late (GitHub may delay schedules 15+ minutes) or skipped still sends it on
 * the next run. The dedupe key (`type:eventId@originalStartsAt`, unique per
 * recipient) keeps it to one notification however many runs see the
 * occurrence.
 *
 * Threshold decision: the day-before reminder stops one hour before the start
 * (`minimumLeadMinutes: 60`). An event created (or answered) with less notice
 * than that only gets the 15-minute call, so a "day before" nudge never lands
 * right before, or together with, the 15-minute reminder. The copy of the
 * day-before reminder says "Hoy" or "Mañana" from the real start, so an event
 * created with less than 24 h of notice is not announced as tomorrow.
 *
 * Audience decision: the day-before reminder goes to "Voy" and "Tal vez"
 * (a nudge helps undecided members plan); the 15-minute reminder only to
 * "Voy" (it is a "starting now" call to join). Waitlisted members get
 * neither: they hold no seat, and a promotion notifies them separately.
 */
export const TRIBE_EVENT_REMINDER = {
  dayBefore: {
    leadMinutes: 1440,
    minimumLeadMinutes: 60,
    statuses: [TRIBE_EVENT_ATTENDANCE_STATUS.going, TRIBE_EVENT_ATTENDANCE_STATUS.maybe],
    type: NOTIFICATION_TYPE.eventReminderDayBefore,
  },
  soon: {
    leadMinutes: 15,
    minimumLeadMinutes: 0,
    statuses: [TRIBE_EVENT_ATTENDANCE_STATUS.going],
    type: NOTIFICATION_TYPE.eventReminderSoon,
  },
} as const;

export const TRIBE_EVENT_REMINDERS = [TRIBE_EVENT_REMINDER.dayBefore, TRIBE_EVENT_REMINDER.soon] as const;

/**
 * Bounded processing per cron run: series are read in keyset pages so one
 * run never loads every series of the platform at once (at most
 * `maxPagesPerRun * seriesPerPage` series with an effective date in the next
 * day; series whose cadence has no date there are filtered before the page
 * limit and never count against the cap). A run
 * that hits the page cap reports `isComplete: false` in its structured log:
 * that is the signal to raise the cap or shard the cron before reminders of
 * the remaining series are skipped.
 */
export const TRIBE_EVENT_REMINDER_BATCH = {
  maxPagesPerRun: 10,
  seriesPerPage: 200,
} as const;
