/**
 * Catalog and limits of the in-app notification inbox. The type values
 * mirror the `notifications_valid_type` CHECK of
 * `database/migrations/20260926120000_create_notifications.sql`: adding a
 * type needs a migration that widens the CHECK.
 */
export const NOTIFICATION_TYPE = {
  eventOccurrenceCancelled: "event_occurrence_cancelled",
  eventOccurrenceMoved: "event_occurrence_moved",
  eventProposalReviewed: "event_proposal_reviewed",
  eventReminderDayBefore: "event_reminder_24h",
  eventReminderSoon: "event_reminder_15m",
  eventWaitlistPromoted: "event_waitlist_promoted",
} as const;

export const NOTIFICATION_TYPES = [
  NOTIFICATION_TYPE.eventReminderDayBefore,
  NOTIFICATION_TYPE.eventReminderSoon,
  NOTIFICATION_TYPE.eventWaitlistPromoted,
  NOTIFICATION_TYPE.eventProposalReviewed,
  NOTIFICATION_TYPE.eventOccurrenceCancelled,
  NOTIFICATION_TYPE.eventOccurrenceMoved,
] as const;

/**
 * Review outcomes carried by `event_proposal_reviewed` (withdrawals notify
 * nobody).
 */
export const NOTIFICATION_PROPOSAL_DECISION = {
  approved: "approved",
  rejected: "rejected",
} as const;

export const NOTIFICATION_INBOX = {
  /** Newest notifications returned by the inbox (popover list). */
  listLimit: 30,
  /**
   * The unread count stops counting here: the badge only shows "9+" and a
   * bounded count keeps the query cheap for very old inboxes.
   */
  unreadCountCap: 100,
} as const;

/**
 * Retention of read notifications, purged by the reminder cron in bounded
 * batches so one run never holds a long delete.
 */
export const NOTIFICATION_RETENTION = {
  maxBatchesPerRun: 10,
  purgeBatchSize: 1000,
  readRetentionDays: 90,
} as const;

export const NOTIFICATION_MUTATION_STATUS = {
  marked: "marked",
  notFound: "not_found",
} as const;

/**
 * Separator of dedupe keys: `<type>:<subject>[:<version>]`. The SQL
 * producers build the same shape (see the migration).
 */
export const NOTIFICATION_DEDUPE_KEY_SEPARATOR = ":";
