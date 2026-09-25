import {
  type NOTIFICATION_PROPOSAL_DECISION,
  NOTIFICATION_TYPE,
} from "@/src/modules/notifications/constants/notifications";

/**
 * In-app notification model. It is generic (type, recipient, tribe, payload,
 * dedupe key, read state); each type declares its minimal payload of ids and
 * instants, and the inbox resolves the display facts (titles, tribe) at read
 * time so the copy never goes stale and no sensitive text is stored twice.
 */

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export type NotificationProposalDecision =
  (typeof NOTIFICATION_PROPOSAL_DECISION)[keyof typeof NOTIFICATION_PROPOSAL_DECISION];

/**
 * One occurrence of an event series, by its stable identity
 * (`eventId@occurrenceStartsAt`, the original start) plus the effective start
 * the notification talks about.
 */
export type NotificationEventOccurrencePayload = {
  eventId: string;
  occurrenceStartsAt: string;
};

export type NotificationEventOccurrenceTimedPayload = NotificationEventOccurrencePayload & {
  startsAt: string;
};

/**
 * Stored payload of each notification type: ids and instants only.
 */
export type NotificationPayloadByType = {
  [NOTIFICATION_TYPE.eventOccurrenceCancelled]: NotificationEventOccurrencePayload;
  [NOTIFICATION_TYPE.eventOccurrenceMoved]: NotificationEventOccurrenceTimedPayload;
  [NOTIFICATION_TYPE.eventProposalReviewed]: {
    decision: NotificationProposalDecision;
    eventId: string | null;
    proposalId: string;
  };
  [NOTIFICATION_TYPE.eventRecordingAvailable]: NotificationEventOccurrencePayload;
  [NOTIFICATION_TYPE.eventReminderDayBefore]: NotificationEventOccurrenceTimedPayload;
  [NOTIFICATION_TYPE.eventReminderSoon]: NotificationEventOccurrenceTimedPayload;
  [NOTIFICATION_TYPE.eventWaitlistPromoted]: NotificationEventOccurrencePayload;
};

export type NotificationEventOccurrenceType = Exclude<
  NotificationType,
  typeof NOTIFICATION_TYPE.eventProposalReviewed
>;

/**
 * Notification to enqueue for one recipient. The dedupe key is unique per
 * recipient, so enqueuing the same notification twice is a no-op.
 */
export type NewNotification<TType extends NotificationType = NotificationType> = {
  dedupeKey: string;
  payload: NotificationPayloadByType[TType];
  recipientUserId: string;
  tribeId: string;
  type: TType;
};

export type NotificationTribe = {
  name: string;
  slug: string;
};

/**
 * Event occurrence as shown in the inbox. `eventTitle` is null when the
 * event was deleted after the notification was sent; `startsAt` is the start
 * the notification refers to (the new time of a move, the effective time
 * otherwise).
 */
export type NotificationEventOccurrenceSubject = {
  eventId: string;
  eventTitle: string | null;
  occurrenceStartsAt: string;
  startsAt: string;
};

/**
 * Reviewed proposal as shown to its author. `eventId`/`eventStartsAt` point
 * at the event created on approval (null when rejected or deleted).
 */
export type NotificationProposalSubject = {
  decision: NotificationProposalDecision;
  eventId: string | null;
  eventStartsAt: string | null;
  proposalId: string;
  proposalTitle: string | null;
  reviewNote: string | null;
};

type InboxNotificationBase = {
  createdAt: string;
  id: string;
  readAt: string | null;
  tribe: NotificationTribe;
};

export type InboxNotification =
  | (InboxNotificationBase & {
      event: NotificationEventOccurrenceSubject;
      type: NotificationEventOccurrenceType;
    })
  | (InboxNotificationBase & {
      proposal: NotificationProposalSubject;
      type: typeof NOTIFICATION_TYPE.eventProposalReviewed;
    });

export type NotificationInbox = {
  notifications: InboxNotification[];
  /** Unread notifications, bounded by the inbox count cap. */
  unreadCount: number;
};
