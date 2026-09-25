import { sql } from "drizzle-orm";

import {
  NOTIFICATION_MUTATION_STATUS,
  NOTIFICATION_PROPOSAL_DECISION,
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPES,
} from "@/src/modules/notifications/constants/notifications";
import type {
  InboxNotification,
  NotificationInbox,
  NotificationProposalDecision,
  NotificationType,
} from "@/src/modules/notifications/domain/entities/notification";
import type {
  CountUnreadNotificationsRepositoryQuery,
  GetNotificationInboxRepositoryQuery,
  MarkAllNotificationsReadRepositoryResult,
  MarkNotificationReadRepositoryCommand,
  MarkNotificationReadRepositoryResult,
  NotificationRepository,
  PurgeReadNotificationsRepositoryCommand,
} from "@/src/modules/notifications/domain/repositories/notification-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Runs a callback inside the request-scoped transaction
 * (`withRequestContext`), which sets `app.current_user_id` for the guards.
 */
export type NotificationDatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

/**
 * Structured logger the repository reports skipped rows to (wired with the
 * server logger in `setup.ts`).
 */
export type NotificationRepositoryLogger = {
  warn: (entry: { message: string; metadata?: Record<string, unknown> }) => void;
};

export type PostgresNotificationRepositoryOptions = {
  logger?: NotificationRepositoryLogger;
};

const INVALID_PAYLOAD_INSTANT_LOG_MESSAGE =
  "PostgresNotificationRepository:getInbox skipped a notification with an invalid instant in its payload";

type NotificationInboxRow = {
  created_at: Date | string;
  event_starts_at: Date | string | null;
  event_title: string | null;
  id: string;
  moved_starts_at: Date | string | null;
  payload: unknown;
  proposal_review_note: string | null;
  proposal_title: string | null;
  read_at: Date | string | null;
  tribe_name: string;
  tribe_slug: string;
  type: string;
};

/**
 * Payload ids are cast to uuid/timestamptz only when they have the exact
 * shape the producers write, so one malformed row can never fail the whole
 * inbox with a cast error.
 */
const PAYLOAD_UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const PAYLOAD_INSTANT_PATTERN = "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$";
const COUNT_BASE = 10;

function mapInstant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapNullableInstant(value: Date | string | null): string | null {
  return value === null ? null : mapInstant(value);
}

/**
 * Normalizes a payload instant to ISO, or null when the stored string is not
 * a valid date (`toISOString()` would throw and fail the whole inbox). The
 * payload is only constrained to be a JSON object, so this is the minimal
 * defensive check of the mapper, not a schema validation.
 */
function parsePayloadInstant(value: string): string | null {
  const instant = new Date(value);

  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

function mapCount(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  const parsed = typeof value === "string" ? Number.parseInt(value, COUNT_BASE) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : 0;
}

function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

function isProposalDecision(value: unknown): value is NotificationProposalDecision {
  return (
    value === NOTIFICATION_PROPOSAL_DECISION.approved ||
    value === NOTIFICATION_PROPOSAL_DECISION.rejected
  );
}

/**
 * Reads one string field of the stored payload (minimal narrowing: the
 * payload is written by the producers, not revalidated with a schema).
 */
function readPayloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
}

const PAYLOAD_KEY = {
  decision: "decision",
  eventId: "eventId",
  occurrenceStartsAt: "occurrenceStartsAt",
  proposalId: "proposalId",
  startsAt: "startsAt",
} as const;

type InvalidPayloadInstantField =
  | typeof PAYLOAD_KEY.occurrenceStartsAt
  | typeof PAYLOAD_KEY.startsAt;

type ReportInvalidPayloadInstant = (
  row: NotificationInboxRow,
  field: InvalidPayloadInstantField
) => void;

/**
 * Maps an inbox row to the domain notification, or null when the row cannot
 * be shown (unknown type, missing ids, or an invalid payload instant), so it
 * is skipped instead of failing the inbox. A cancellation notice always shows
 * the cancelled time: a later move of the same date (the exception switched
 * to `moved`) must not rewrite that historical notice.
 */
function mapInboxNotification(
  row: NotificationInboxRow,
  reportInvalidPayloadInstant: ReportInvalidPayloadInstant
): InboxNotification | null {
  if (!isNotificationType(row.type)) {
    return null;
  }

  const base = {
    createdAt: mapInstant(row.created_at),
    id: row.id,
    readAt: mapNullableInstant(row.read_at),
    tribe: { name: row.tribe_name, slug: row.tribe_slug },
  };

  if (row.type === NOTIFICATION_TYPE.eventProposalReviewed) {
    const proposalId = readPayloadString(row.payload, PAYLOAD_KEY.proposalId);
    const decision = readPayloadString(row.payload, PAYLOAD_KEY.decision);

    if (!proposalId || !isProposalDecision(decision)) {
      return null;
    }

    const eventStartsAt = mapNullableInstant(row.event_starts_at);

    return {
      ...base,
      proposal: {
        decision,
        eventId: eventStartsAt ? readPayloadString(row.payload, PAYLOAD_KEY.eventId) : null,
        eventStartsAt,
        proposalId,
        proposalTitle: row.proposal_title,
        reviewNote: row.proposal_review_note,
      },
      type: row.type,
    };
  }

  const eventId = readPayloadString(row.payload, PAYLOAD_KEY.eventId);
  const rawOccurrenceStartsAt = readPayloadString(row.payload, PAYLOAD_KEY.occurrenceStartsAt);

  if (!eventId || !rawOccurrenceStartsAt) {
    return null;
  }

  const occurrenceStartsAt = parsePayloadInstant(rawOccurrenceStartsAt);

  if (!occurrenceStartsAt) {
    reportInvalidPayloadInstant(row, PAYLOAD_KEY.occurrenceStartsAt);

    return null;
  }

  const rawPayloadStartsAt = readPayloadString(row.payload, PAYLOAD_KEY.startsAt);
  const payloadStartsAt = rawPayloadStartsAt === null ? null : parsePayloadInstant(rawPayloadStartsAt);

  if (rawPayloadStartsAt !== null && !payloadStartsAt) {
    reportInvalidPayloadInstant(row, PAYLOAD_KEY.startsAt);

    return null;
  }

  const startsAt =
    row.type === NOTIFICATION_TYPE.eventOccurrenceCancelled
      ? occurrenceStartsAt
      : payloadStartsAt ?? mapNullableInstant(row.moved_starts_at) ?? occurrenceStartsAt;

  return {
    ...base,
    event: {
      eventId,
      eventTitle: row.event_title,
      occurrenceStartsAt,
      startsAt,
    },
    type: row.type,
  };
}

/**
 * Notifications the signed-in user may see: their own (the recipient guard
 * repeats the RLS policy because the runtime role bypasses RLS) and only of
 * tribes they can still read, so a member who left or was blocked stops
 * seeing that tribe's notifications.
 */
const VISIBLE_NOTIFICATION_PREDICATE = sql`
  notifications.recipient_user_id = public.current_app_user_id()
  and public.can_read_tribe_content(notifications.tribe_id)
`;

/**
 * Inbox reads, marks, and the retention purge of `public.notifications`.
 * Display facts (event and proposal titles, the new time of a moved date)
 * are resolved at read time from the ids of the payload.
 */
export class PostgresNotificationRepository implements NotificationRepository {
  private readonly logger?: NotificationRepositoryLogger;

  constructor(
    private readonly executeWithDatabase: NotificationDatabaseExecutor,
    options: PostgresNotificationRepositoryOptions = {}
  ) {
    this.logger = options.logger;
  }

  async getInbox({
    limit,
    unreadCountCap,
  }: GetNotificationInboxRepositoryQuery): Promise<NotificationInbox> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          notifications.id,
          notifications.type,
          notifications.payload,
          notifications.created_at,
          notifications.read_at,
          tribes.slug as tribe_slug,
          tribes.name as tribe_name,
          events.title as event_title,
          events.starts_at as event_starts_at,
          moved_exceptions.new_starts_at as moved_starts_at,
          event_proposals.title as proposal_title,
          event_proposals.review_note as proposal_review_note
        from public.notifications
        inner join public.tribes
          on tribes.id = notifications.tribe_id
        cross join lateral (
          select
            case
              when notifications.payload ->> 'eventId' ~ ${PAYLOAD_UUID_PATTERN}
                then (notifications.payload ->> 'eventId')::uuid
            end as event_id,
            case
              when notifications.payload ->> 'proposalId' ~ ${PAYLOAD_UUID_PATTERN}
                then (notifications.payload ->> 'proposalId')::uuid
            end as proposal_id,
            case
              when notifications.payload ->> 'occurrenceStartsAt' ~ ${PAYLOAD_INSTANT_PATTERN}
                then (notifications.payload ->> 'occurrenceStartsAt')::timestamptz
            end as occurrence_starts_at
        ) as subject
        left join public.events
          on events.id = subject.event_id
          and events.tribe_id = notifications.tribe_id
        left join public.event_occurrence_exceptions moved_exceptions
          on moved_exceptions.event_id = subject.event_id
          and moved_exceptions.original_starts_at = subject.occurrence_starts_at
          and moved_exceptions.kind = 'moved'
        left join public.event_proposals
          on event_proposals.id = subject.proposal_id
          and event_proposals.tribe_id = notifications.tribe_id
          and event_proposals.proposed_by = notifications.recipient_user_id
        where ${VISIBLE_NOTIFICATION_PREDICATE}
        order by notifications.created_at desc, notifications.id desc
        limit ${limit}
      `);
      const unreadCount = await this.countUnreadWith(database, unreadCountCap);
      const notifications = ((result.rows ?? []) as NotificationInboxRow[]).flatMap((row) => {
        const notification = mapInboxNotification(row, (skippedRow, field) => {
          this.logger?.warn({
            message: INVALID_PAYLOAD_INSTANT_LOG_MESSAGE,
            metadata: { field, notificationId: skippedRow.id, type: skippedRow.type },
          });
        });

        return notification ? [notification] : [];
      });

      return { notifications, unreadCount };
    });
  }

  async countUnread({ unreadCountCap }: CountUnreadNotificationsRepositoryQuery): Promise<number> {
    return this.executeWithDatabase((database) => this.countUnreadWith(database, unreadCountCap));
  }

  async markRead({
    notificationId,
    unreadCountCap,
  }: MarkNotificationReadRepositoryCommand): Promise<MarkNotificationReadRepositoryResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_notification as (
          select notifications.id
          from public.notifications
          where notifications.id = ${notificationId}
            and notifications.recipient_user_id = public.current_app_user_id()
        ),
        marked_notification as (
          update public.notifications
          set read_at = clock_timestamp()
          from target_notification
          where notifications.id = target_notification.id
            and notifications.read_at is null
          returning notifications.id
        )
        select exists (select 1 from target_notification) as is_found
      `);
      const isFound = Boolean((result.rows?.[0] as { is_found?: unknown } | undefined)?.is_found);

      if (!isFound) {
        return { status: NOTIFICATION_MUTATION_STATUS.notFound };
      }

      return {
        status: NOTIFICATION_MUTATION_STATUS.marked,
        unreadCount: await this.countUnreadWith(database, unreadCountCap),
      };
    });
  }

  async markAllRead({
    unreadCountCap,
  }: CountUnreadNotificationsRepositoryQuery): Promise<MarkAllNotificationsReadRepositoryResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with marked_notifications as (
          update public.notifications
          set read_at = clock_timestamp()
          where notifications.recipient_user_id = public.current_app_user_id()
            and notifications.read_at is null
          returning notifications.id
        )
        select count(*)::integer as marked_count
        from marked_notifications
      `);

      return {
        markedCount: mapCount((result.rows?.[0] as { marked_count?: unknown } | undefined)?.marked_count),
        unreadCount: await this.countUnreadWith(database, unreadCountCap),
      };
    });
  }

  /**
   * Deletes one batch of old read notifications through the owner-only
   * `purge_read_notifications` function, so the maintenance connection works
   * with a dedicated role that only holds EXECUTE on it. `skip locked`
   * inside lets two overlapping cron runs split the work instead of waiting
   * on each other.
   */
  async purgeReadBatch({
    batchSize,
    readBefore,
  }: PurgeReadNotificationsRepositoryCommand): Promise<number> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.purge_read_notifications(
          ${batchSize}::integer,
          ${readBefore}::timestamptz
        ) as deleted_count
      `);

      return mapCount((result.rows?.[0] as { deleted_count?: unknown } | undefined)?.deleted_count);
    });
  }

  /**
   * Unread count bounded by `cap` (the badge shows "9+"), in the caller's
   * transaction so it reflects a mark done just before.
   */
  private async countUnreadWith(database: RequestDatabase, cap: number): Promise<number> {
    const result = await database.execute(sql`
      select count(*)::integer as unread_count
      from (
        select 1
        from public.notifications
        where ${VISIBLE_NOTIFICATION_PREDICATE}
          and notifications.read_at is null
        limit ${cap}
      ) as unread_notifications
    `);

    return mapCount((result.rows?.[0] as { unread_count?: unknown } | undefined)?.unread_count);
  }
}
