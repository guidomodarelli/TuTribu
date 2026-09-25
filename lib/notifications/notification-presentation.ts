import {
  formatBuenosAiresShortDate,
  getBuenosAiresDateKey,
  formatBuenosAiresTime,
  formatBuenosAiresWeekdayDay,
} from "@/lib/date-time/buenos-aires-format";
import { buildTribeEventsRoute } from "@/lib/events/tribe-events-routes";
import { buildTribeEventOccurrenceKey } from "@/src/modules/events/application/services/tribe-event-occurrences";
import { TRIBE_EVENT_REMINDER } from "@/src/modules/events/constants/tribe-event-reminders";
import type { NotificationItemResult } from "@/src/modules/notifications/application/results/notification-result";
import {
  NOTIFICATION_PROPOSAL_DECISION,
  NOTIFICATION_TYPE,
} from "@/src/modules/notifications/constants/notifications";

/**
 * Pure presentation of an inbox item: the Spanish copy and the deep link.
 * The payload only carries ids and instants; titles and tribe come resolved
 * from the inbox, and every time is shown in Buenos Aires.
 */

export type NotificationPresentation = {
  /** Secondary line (when, where, or the review note). */
  detail: string;
  /** In-app link: the occurrence deep link (`?event=eventId@startsAt`). */
  href: string;
  /** Short creation stamp, "12 may · 18:00". */
  sentAtLabel: string;
  title: string;
};

const COPY = {
  at: " a las ",
  deletedEventTitle: "un evento",
  separator: " · ",
} as const;

/** Title prefix of the day-before reminder, from the real start day. */
const DAY_BEFORE_REMINDER_PREFIX = {
  fallback: "Recordatorio",
  today: "Hoy",
  tomorrow: "Mañana",
} as const;

const MILLISECONDS_PER_MINUTE = 60_000;
// Buenos Aires has no daylight saving time, so one calendar day is 24 h.
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * "Hoy" or "Mañana" comparing the Buenos Aires calendar day of the start with
 * the day the reminder was sent. The reminder is sent up to 24 h ahead and
 * catches up late or late-notice events, so it is not always "tomorrow".
 */
function describeDayBeforePrefix(startsAt: string, sentAt: string): string {
  const startDateKey = getBuenosAiresDateKey(startsAt);

  if (startDateKey === getBuenosAiresDateKey(sentAt)) {
    return DAY_BEFORE_REMINDER_PREFIX.today;
  }

  if (startDateKey === getBuenosAiresDateKey(new Date(Date.parse(sentAt) + MILLISECONDS_PER_DAY))) {
    return DAY_BEFORE_REMINDER_PREFIX.tomorrow;
  }

  return DAY_BEFORE_REMINDER_PREFIX.fallback;
}

/**
 * Whole minutes left between sending the 15-minute reminder and the start,
 * rounded up and kept between 1 and the reminder lead, so a run the
 * scheduler delayed announces the real time left.
 */
function countSoonReminderMinutes(startsAt: string, sentAt: string): number {
  const minutesLeft = Math.ceil((Date.parse(startsAt) - Date.parse(sentAt)) / MILLISECONDS_PER_MINUTE);

  return Math.min(Math.max(minutesLeft, 1), TRIBE_EVENT_REMINDER.soon.leadMinutes);
}

function describeMinutes(minutes: number): string {
  return minutes === 1 ? `${minutes} minuto` : `${minutes} minutos`;
}

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * "jueves 12 de mayo a las 18:00" (lowercase, to follow "Era el" or "Ahora
 * es el").
 */
function formatWhen(startsAt: string): string {
  return formatBuenosAiresWeekdayDay(startsAt, true) + COPY.at + formatBuenosAiresTime(startsAt);
}

function formatSentAt(createdAt: string): string {
  return formatBuenosAiresShortDate(createdAt) + COPY.separator + formatBuenosAiresTime(createdAt);
}

type EventNotificationItem = Extract<NotificationItemResult, { event: unknown }>;
type ProposalNotificationItem = Extract<NotificationItemResult, { proposal: unknown }>;

function buildEventHref(item: EventNotificationItem): string {
  if (item.event.eventTitle === null) {
    return buildTribeEventsRoute(item.tribe.slug);
  }

  return buildTribeEventsRoute(item.tribe.slug, {
    occurrenceKey: buildTribeEventOccurrenceKey(item.event.eventId, item.event.occurrenceStartsAt),
  });
}

function describeEventNotification(item: EventNotificationItem): Omit<NotificationPresentation, "href" | "sentAtLabel"> {
  const title = item.event.eventTitle ?? COPY.deletedEventTitle;
  const whereAndWhen = formatWhen(item.event.startsAt) + COPY.separator + item.tribe.name;

  switch (item.type) {
    case NOTIFICATION_TYPE.eventReminderDayBefore:
      return {
        detail: capitalizeFirst(whereAndWhen),
        title: `${describeDayBeforePrefix(item.event.startsAt, item.createdAt)}: ${title}`,
      };
    case NOTIFICATION_TYPE.eventReminderSoon:
      return {
        detail: formatBuenosAiresTime(item.event.startsAt) + COPY.separator + item.tribe.name,
        title: `${capitalizeFirst(title)} empieza en ${describeMinutes(
          countSoonReminderMinutes(item.event.startsAt, item.createdAt)
        )}`,
      };
    case NOTIFICATION_TYPE.eventWaitlistPromoted:
      return {
        detail: capitalizeFirst(whereAndWhen),
        title: `¡Se liberó un lugar! Ya estás confirmado en ${title}.`,
      };
    case NOTIFICATION_TYPE.eventOccurrenceCancelled:
      return { detail: `Era el ${whereAndWhen}`, title: `Se canceló ${title}` };
    case NOTIFICATION_TYPE.eventOccurrenceMoved:
      return {
        detail: `Ahora es el ${whereAndWhen}`,
        title: `${capitalizeFirst(title)} cambió de horario`,
      };
    case NOTIFICATION_TYPE.eventRecordingAvailable:
      return {
        detail: `Fue el ${whereAndWhen}`,
        title: `Ya está la grabación de ${title}`,
      };
  }
}

function describeProposalNotification(
  item: ProposalNotificationItem
): Omit<NotificationPresentation, "sentAtLabel"> {
  const title = item.proposal.proposalTitle ?? COPY.deletedEventTitle;
  const detail = item.proposal.reviewNote
    ? `Nota: ${item.proposal.reviewNote}`
    : item.tribe.name;

  if (item.proposal.decision === NOTIFICATION_PROPOSAL_DECISION.approved) {
    return {
      detail,
      href:
        item.proposal.eventId && item.proposal.eventStartsAt
          ? buildTribeEventsRoute(item.tribe.slug, {
              occurrenceKey: buildTribeEventOccurrenceKey(
                item.proposal.eventId,
                item.proposal.eventStartsAt
              ),
            })
          : buildTribeEventsRoute(item.tribe.slug),
      title: `Aprobaron tu propuesta «${title}»`,
    };
  }

  return {
    detail,
    href: buildTribeEventsRoute(item.tribe.slug),
    title: `Tu propuesta «${title}» no fue aprobada`,
  };
}

/**
 * Builds the copy and link of one notification.
 *
 * @param item - Inbox item (public DTO).
 * @returns Title, detail line, creation stamp, and in-app href.
 */
export function describeNotification(item: NotificationItemResult): NotificationPresentation {
  const sentAtLabel = formatSentAt(item.createdAt);

  if (item.type === NOTIFICATION_TYPE.eventProposalReviewed) {
    return { ...describeProposalNotification(item), sentAtLabel };
  }

  return { ...describeEventNotification(item), href: buildEventHref(item), sentAtLabel };
}

/**
 * Accessible label of the bell: announces the unread count.
 *
 * @param unreadCount - Unread notifications (bounded by the inbox cap).
 * @returns "Notificaciones" or "Notificaciones, 3 sin leer".
 */
export function describeUnreadNotifications(unreadCount: number): string {
  if (unreadCount === 0) {
    return "Notificaciones";
  }

  return unreadCount === 1
    ? "Notificaciones, 1 sin leer"
    : `Notificaciones, ${formatUnreadBadge(unreadCount)} sin leer`;
}

/** Badge shows up to this number; above it, "9+". */
export const NOTIFICATION_BADGE_MAX = 9;

/**
 * Visible badge text.
 *
 * @param unreadCount - Unread notifications.
 * @returns "3" or "9+".
 */
export function formatUnreadBadge(unreadCount: number): string {
  return unreadCount > NOTIFICATION_BADGE_MAX ? `${NOTIFICATION_BADGE_MAX}+` : String(unreadCount);
}
