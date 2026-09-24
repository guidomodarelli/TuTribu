import { sql } from "drizzle-orm";

import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_ATTENDEE_PREVIEW_LIMIT,
  TRIBE_EVENT_CAPACITY_UPDATE_KIND,
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_PROPOSAL_STATUS,
  TRIBE_EVENT_RANGE_MATCH,
} from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventAttendanceOption,
  TribeEventAttendanceStatus,
  TribeEventAttendee,
  TribeEventAttendeePreview,
  TribeEventDateRange,
  TribeEventOccurrenceException,
  TribeEventRangeMatch,
} from "@/src/modules/events/domain/entities/tribe-event";
import type {
  DeleteTribeEventRepositoryCommand,
  FindTribeEventQuery,
  GetTribeEventAttendanceReportQuery,
  ListTribeEventOccurrencesQuery,
  ListTribeEventsByRangeQuery,
  PersistTribeEventCommand,
  PersistTribeEventUpdateCommand,
  ReadViewerAttendanceStreakSnapshotQuery,
  SetTribeEventAttendanceRepositoryCommand,
  TribeEventAttendanceReportLookup,
  TribeEventAttendanceResult,
  TribeEventAttendanceSummary,
  TribeEventAttendanceWriteCommand,
  TribeEventCreationResult,
  TribeEventDeletionResult,
  TribeEventOccurrenceAttendance,
  TribeEventOccurrenceListing,
  TribeEventRangeListing,
  TribeEventRepository,
  TribeEventUpdateResult,
  TribeEventViewerAttendance,
  TribeEventViewerAttendanceHistory,
} from "@/src/modules/events/domain/repositories/tribe-event-repository";
import {
  getWaitlistRefillLookbackDurationMs,
  selectRefillableWaitlistOccurrenceStarts,
} from "@/src/modules/events/domain/services/tribe-event-attendance";
import {
  RETURNING_TRIBE_EVENT_COLUMNS,
  TRIBE_EVENT_COLUMNS,
  TRIBE_EVENT_OCCURRENCE_DURATION,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS,
  buildMovedIntoRangePredicate,
  buildSeriesInRangePredicate,
  buildTribeEventExceptionsInRangeQuery,
  mapCount,
  mapDateValue,
  mapNullableCount,
  mapNullableDateValue,
  mapTribeEvent,
  mapTribeEventOccurrenceExceptions,
  type TribeEventDatabaseExecutor,
  type TribeEventOccurrenceExceptionRow,
  type TribeEventRow,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-sql";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type EventListRow = {
  can_manage_events: boolean | null;
  can_propose_events: boolean | null;
  capacity: number | string | null;
  description: string | null;
  ends_at: Date | string | null;
  event_type: string | null;
  id: string | null;
  meeting_url: string | null;
  pending_proposal_count: number | string | null;
  recurrence_frequency: string | null;
  recurrence_until: Date | string | null;
  starts_at: Date | string | null;
  title: string | null;
};

type AttendanceSummaryRow = {
  event_id: string;
  going_count: number | string | null;
  going_preview: unknown;
  maybe_count: number | string | null;
  occurrence_starts_at: Date | string;
  viewer_status: string | null;
  viewer_waitlist_position: number | string | null;
  waitlisted_count: number | string | null;
};

type WaitlistedOccurrenceRow = {
  occurrence_starts_at: Date | string;
};

type ViewerAttendanceValue = {
  event_id?: unknown;
  occurrence_starts_at?: unknown;
  status?: unknown;
} | null;

/**
 * Event row of the streak snapshot, with the viewer answers of that series
 * aggregated by the same statement as a JSON array and the database instant
 * of that statement (equal on every row).
 */
type EventWithViewerAttendancesRow = EventListRow & {
  occurrence_exceptions: unknown;
  snapshot_reference_time: Date | string | null;
  viewer_attendances: unknown;
};

type AttendeeRow = {
  name: string | null;
  responded_at: Date | string;
  status: string | null;
};

type ReportAccessRow = {
  status: string | null;
};

type TrendRow = {
  going_count: number | string | null;
  occurrence_starts_at: Date | string;
};

type AttendancePreviewValue = {
  id?: unknown;
  image?: unknown;
  name?: unknown;
} | null;

type EventMutationRow = TribeEventRow & {
  status: string | null;
};

/**
 * Update row plus whether the capacity or the schedule actually changed
 * compared with the event row locked before the UPDATE. Only an explicit
 * `false` skips the waitlist refill; a missing flag refills to stay on the
 * safe side.
 */
type EventUpdateRow = EventMutationRow & {
  waitlist_refill_needed?: boolean | null;
};

/**
 * Capacity and schedule of the event row as locked `FOR UPDATE` right before
 * the UPDATE, that is, the version the UPDATE actually replaces.
 */
type LockedEventRow = Pick<
  TribeEventRow,
  "capacity" | "ends_at" | "recurrence_frequency" | "recurrence_until" | "starts_at"
>;

type EventDeletionRow = {
  status: string | null;
};

type AttendanceResponseRow = {
  attendance_status: string | null;
  outcome: string | null;
  promoted_count: number | string | null;
};

/**
 * Outcomes returned by `public.respond_to_tribe_event_occurrence`.
 */
const ATTENDANCE_RESPONSE_OUTCOME = {
  cancelled: "cancelled",
  cleared: "cleared",
  ended: "ended",
  forbidden: "forbidden",
  invalid: "invalid",
  notFound: "not_found",
  saved: "saved",
  scheduleChanged: "schedule_changed",
} as const;
/**
 * Status order of the manager attendee list: who goes first, the waitlist in
 * FIFO order, then maybe and not going.
 */
const ATTENDEE_STATUS_ORDER = [
  TRIBE_EVENT_ATTENDANCE_STATUS.going,
  TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted,
  TRIBE_EVENT_ATTENDANCE_STATUS.maybe,
  TRIBE_EVENT_ATTENDANCE_STATUS.notGoing,
] as const;
const SINGLE_OCCURRENCE_RANGE_MS = 1;
/** Separator of the SQL value lists built with `sql.join`. */
const SQL_LIST_SEPARATOR = sql`, `;


function mapAttendanceStatus(value: string | null): TribeEventAttendanceStatus | null {
  return (
    Object.values(TRIBE_EVENT_ATTENDANCE_STATUS).find((status) => status === value) ??
    null
  );
}

function isEventRow(row: EventListRow): row is EventListRow & TribeEventRow {
  return row.id !== null && row.starts_at !== null && row.title !== null;
}

function mapEventRows(rows: EventListRow[]): TribeEvent[] {
  return rows.reduce<TribeEvent[]>((mappedEvents, row) => {
    if (isEventRow(row)) {
      mappedEvents.push(mapTribeEvent(row));
    }

    return mappedEvents;
  }, []);
}

/**
 * Maps the `going_preview` JSON array built by the summary query, dropping
 * any malformed entry instead of failing the whole listing.
 */
function mapGoingPreview(value: unknown): TribeEventAttendeePreview[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<TribeEventAttendeePreview[]>(
    (previews, entry: AttendancePreviewValue) => {
      if (entry && typeof entry.id === "string" && typeof entry.name === "string") {
        previews.push({
          id: entry.id,
          image: typeof entry.image === "string" ? entry.image : null,
          name: entry.name,
        });
      }

      return previews;
    },
    []
  );
}

/**
 * Maps the `viewer_attendances` JSON arrays of the streak snapshot rows,
 * dropping any malformed entry or unknown status instead of failing the read.
 */
function mapViewerAttendances(rows: EventWithViewerAttendancesRow[]): TribeEventViewerAttendance[] {
  return rows.flatMap((row) => {
    if (!Array.isArray(row.viewer_attendances)) {
      return [];
    }

    return row.viewer_attendances.flatMap((entry: ViewerAttendanceValue) => {
      const status =
        typeof entry?.status === "string" ? mapAttendanceStatus(entry.status) : null;
      const occurrenceTime =
        typeof entry?.occurrence_starts_at === "string"
          ? Date.parse(entry.occurrence_starts_at)
          : Number.NaN;

      if (!status || typeof entry?.event_id !== "string" || !Number.isFinite(occurrenceTime)) {
        return [];
      }

      return [
        {
          eventId: entry.event_id,
          occurrenceStartsAt: new Date(occurrenceTime).toISOString(),
          status,
        },
      ];
    });
  });
}

/**
 * Maps the `occurrence_exceptions` JSON arrays of the streak snapshot rows.
 * Only the structural shape the mapper needs is checked (the rows come from
 * this repository's own statement); entries without an event id or original
 * start are dropped instead of failing the read.
 */
function mapSnapshotExceptions(
  rows: EventWithViewerAttendancesRow[]
): TribeEventOccurrenceException[] {
  return mapTribeEventOccurrenceExceptions(
    rows.flatMap((row) =>
      Array.isArray(row.occurrence_exceptions)
        ? (row.occurrence_exceptions as Partial<TribeEventOccurrenceExceptionRow>[]).filter(
            (entry): entry is TribeEventOccurrenceExceptionRow =>
              typeof entry?.event_id === "string" &&
              typeof entry.original_starts_at === "string"
          )
        : []
    )
  );
}

function mapAttendanceSummaryFields(row: AttendanceSummaryRow): TribeEventAttendanceSummary {
  return {
    goingCount: mapCount(row.going_count),
    goingPreview: mapGoingPreview(row.going_preview),
    maybeCount: mapCount(row.maybe_count),
    viewerStatus: mapAttendanceStatus(row.viewer_status),
    viewerWaitlistPosition: mapNullableCount(row.viewer_waitlist_position),
    waitlistedCount: mapCount(row.waitlisted_count),
  };
}

function mapAttendanceSummary(row: AttendanceSummaryRow): TribeEventOccurrenceAttendance {
  return {
    ...mapAttendanceSummaryFields(row),
    eventId: row.event_id,
    occurrenceStartsAt: mapDateValue(row.occurrence_starts_at),
  };
}

function createEmptyAttendanceSummary(): TribeEventAttendanceSummary {
  return {
    goingCount: 0,
    goingPreview: [],
    maybeCount: 0,
    viewerStatus: null,
    viewerWaitlistPosition: null,
    waitlistedCount: 0,
  };
}

function mapAttendee(row: AttendeeRow): TribeEventAttendee | null {
  const status = mapAttendanceStatus(row.status);

  return status && row.name !== null
    ? { name: row.name, respondedAt: mapDateValue(row.responded_at), status }
    : null;
}

function mapFailureStatus(
  status: string | null
): typeof TRIBE_EVENT_MUTATION_STATUS.forbidden | typeof TRIBE_EVENT_MUTATION_STATUS.notFound {
  return status === TRIBE_EVENT_MUTATION_STATUS.notFound
    ? TRIBE_EVENT_MUTATION_STATUS.notFound
    : TRIBE_EVENT_MUTATION_STATUS.forbidden;
}

function mapResponseFailureStatus(
  outcome: string | null
):
  | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded
  | typeof TRIBE_EVENT_MUTATION_STATUS.scheduleChanged {
  if (outcome === ATTENDANCE_RESPONSE_OUTCOME.notFound) {
    return TRIBE_EVENT_MUTATION_STATUS.notFound;
  }

  if (outcome === ATTENDANCE_RESPONSE_OUTCOME.cancelled) {
    return TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled;
  }

  if (outcome === ATTENDANCE_RESPONSE_OUTCOME.scheduleChanged) {
    return TRIBE_EVENT_MUTATION_STATUS.scheduleChanged;
  }

  if (outcome === ATTENDANCE_RESPONSE_OUTCOME.ended) {
    return TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded;
  }

  return TRIBE_EVENT_MUTATION_STATUS.forbidden;
}

function mapCreationResult(row: EventMutationRow | null): TribeEventCreationResult {
  if (row?.status === TRIBE_EVENT_MUTATION_STATUS.created) {
    return { event: mapTribeEvent(row), status: row.status };
  }

  return { status: mapFailureStatus(row?.status ?? null) };
}

/**
 * Outcome of the UPDATE statement alone, before the attendance summaries of
 * the visible range are read back.
 */
type EventUpdateRowResult =
  | Omit<Extract<TribeEventUpdateResult, { attendances: unknown }>, "attendances">
  | Exclude<TribeEventUpdateResult, { attendances: unknown }>;

function mapUpdateResult(row: EventMutationRow | null): EventUpdateRowResult {
  if (row?.status === TRIBE_EVENT_MUTATION_STATUS.updated) {
    return { event: mapTribeEvent(row), status: row.status };
  }

  return { status: mapFailureStatus(row?.status ?? null) };
}

function mapDeletionResult(row: EventDeletionRow | null): TribeEventDeletionResult {
  if (
    row?.status === TRIBE_EVENT_MUTATION_STATUS.deleted ||
    row?.status === TRIBE_EVENT_MUTATION_STATUS.notFound
  ) {
    return { status: row.status };
  }

  return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
}

/**
 * Series of the tribe with at least one occurrence whose interval (start to
 * effective end) overlaps `[rangeStart, rangeEnd)`, including series with a
 * date moved into the range, guarded by `can_read_tribe_content` because the
 * runtime role bypasses RLS. Always returns at least one row carrying the
 * viewer permissions: whether the viewer manages events, may propose one
 * (active member who does not manage), and how many proposals wait for
 * review (managers only).
 */
function buildEventsInRangeQuery({
  rangeEnd,
  rangeStart,
  tribeSlug,
  viewerAttendanceRange,
}: TribeEventDateRange & {
  tribeSlug: string;
  viewerAttendanceRange?: TribeEventDateRange;
}) {
  const viewerAttendancesColumn = viewerAttendanceRange
    ? sql`,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'event_id', event_attendances.event_id,
              'occurrence_starts_at', event_attendances.occurrence_starts_at,
              'status', event_attendances.status
            )
            order by event_attendances.occurrence_starts_at
          ),
          '[]'::jsonb
        )
        from public.event_attendances
        inner join public.events
          on events.id = event_attendances.event_id
        where event_attendances.event_id = event_rows.id
          and event_attendances.user_id = public.current_app_user_id()
          and (
            (
              event_attendances.occurrence_starts_at >= ${viewerAttendanceRange.rangeStart}
              and event_attendances.occurrence_starts_at < ${viewerAttendanceRange.rangeEnd}
            )
            or ${buildMovedIntoRangePredicate(
              viewerAttendanceRange,
              TRIBE_EVENT_RANGE_MATCH.startsWithin,
              sql`event_attendances.occurrence_starts_at`
            )}
          )
      ) as viewer_attendances,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'event_id', event_occurrence_exceptions.event_id,
              'original_starts_at', event_occurrence_exceptions.original_starts_at,
              'kind', event_occurrence_exceptions.kind,
              'new_starts_at', event_occurrence_exceptions.new_starts_at,
              'new_ends_at', event_occurrence_exceptions.new_ends_at,
              'reason', event_occurrence_exceptions.reason
            )
            order by event_occurrence_exceptions.original_starts_at
          ),
          '[]'::jsonb
        )
        from public.event_occurrence_exceptions
        inner join public.events
          on events.id = event_occurrence_exceptions.event_id
        where event_occurrence_exceptions.event_id = event_rows.id
          and (
            (
              event_occurrence_exceptions.original_starts_at < ${rangeEnd}
              and event_occurrence_exceptions.original_starts_at
                + ${TRIBE_EVENT_OCCURRENCE_DURATION} > ${rangeStart}
            )
            or (
              event_occurrence_exceptions.kind = ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved}
              and event_occurrence_exceptions.new_starts_at < ${rangeEnd}
              and coalesce(
                event_occurrence_exceptions.new_ends_at,
                event_occurrence_exceptions.new_starts_at + ${TRIBE_EVENT_OCCURRENCE_DURATION}
              ) > ${rangeStart}
            )
          )
      ) as occurrence_exceptions,
      statement_timestamp() as snapshot_reference_time`
    : sql``;

  return sql`
    with target_tribe as (
      select tribes.id
      from public.tribes
      where tribes.slug = ${tribeSlug}
      limit 1
    ),
    viewer_permissions as (
      select
        coalesce(public.can_manage_tribe_events((select id from target_tribe)), false) as can_manage_events,
        coalesce(public.is_active_tribe_member((select id from target_tribe)), false) as is_active_member
    ),
    event_rows as (
      select ${TRIBE_EVENT_COLUMNS}
      from public.events
      inner join target_tribe
        on target_tribe.id = events.tribe_id
      where public.can_read_tribe_content(target_tribe.id)
        and ${buildSeriesInRangePredicate({ rangeEnd, rangeStart })}
    )
    select
      event_rows.id,
      event_rows.capacity,
      event_rows.title,
      event_rows.description,
      event_rows.meeting_url,
      event_rows.starts_at,
      event_rows.ends_at,
      event_rows.recurrence_frequency,
      event_rows.recurrence_until,
      event_rows.event_type,
      viewer_permissions.can_manage_events,
      (
        viewer_permissions.is_active_member and not viewer_permissions.can_manage_events
      ) as can_propose_events,
      case
        when viewer_permissions.can_manage_events then (
          select count(*)
          from public.event_proposals
          where event_proposals.tribe_id = (select id from target_tribe)
            and event_proposals.status = ${TRIBE_EVENT_PROPOSAL_STATUS.pending}
        )
        else 0
      end as pending_proposal_count${viewerAttendancesColumn}
    from viewer_permissions
    left join event_rows
      on true
    order by event_rows.starts_at asc, event_rows.title asc
  `;
}

/**
 * One aggregated row per answered occurrence in the range (optionally of a
 * single event) through `public.summarize_tribe_event_attendances`: totals
 * per status, the viewer answer and waitlist position, and a bounded JSON
 * preview of who is going. Totals, preview, and positions count only active
 * tribe members (the same rule as the seat assignment), which the request
 * role cannot read by itself, so the SECURITY DEFINER function aggregates
 * them after checking `can_read_tribe_content`. Answers are keyed by the
 * original start, so with `includeMovedIn` the range also covers dates moved
 * into it from another month. One call covers the whole range; the preview
 * never selects the email.
 */
function buildAttendanceSummaryQuery({
  eventId,
  includeMovedIn,
  rangeEnd,
  rangeMatch = TRIBE_EVENT_RANGE_MATCH.overlaps,
  rangeStart,
  tribeSlug,
}: TribeEventDateRange & {
  eventId?: string;
  includeMovedIn: boolean;
  rangeMatch?: TribeEventRangeMatch;
  tribeSlug: string;
}) {
  return sql`
    select
      attendance_summaries.event_id,
      attendance_summaries.occurrence_starts_at,
      attendance_summaries.going_count,
      attendance_summaries.maybe_count,
      attendance_summaries.waitlisted_count,
      attendance_summaries.viewer_status,
      attendance_summaries.viewer_waitlist_position,
      attendance_summaries.going_preview
    from public.summarize_tribe_event_attendances(
      ${tribeSlug},
      ${rangeStart}::timestamptz,
      ${rangeEnd}::timestamptz,
      ${rangeMatch === TRIBE_EVENT_RANGE_MATCH.overlaps}::boolean,
      ${TRIBE_EVENT_ATTENDEE_PREVIEW_LIMIT}::integer,
      ${eventId ?? null}::uuid,
      ${includeMovedIn}::boolean
    ) attendance_summaries
  `;
}

async function listExceptionsInRange(
  database: RequestDatabase,
  query: TribeEventDateRange & { eventId?: string; tribeSlug: string }
) {
  const result = await database.execute(buildTribeEventExceptionsInRangeQuery(query));

  return mapTribeEventOccurrenceExceptions(
    (result.rows ?? []) as TribeEventOccurrenceExceptionRow[]
  );
}

/**
 * Whether the UPDATE changed the capacity or the schedule, compared with the
 * row locked before it. Without a locked row (the viewer could not manage the
 * event when the lock was taken) the flag is `null`, which refills
 * conservatively if the UPDATE still went through. Timestamps travel at
 * millisecond precision; a sub-millisecond difference could only report a
 * change and trigger an extra (idempotent) refill, never skip one.
 */
function buildWaitlistRefillNeededExpression(lockedEvent: LockedEventRow | null) {
  if (!lockedEvent) {
    return sql`null::boolean`;
  }

  return sql`(
    ${lockedEvent.capacity}::integer is distinct from updated_event.capacity
    or ${mapDateValue(lockedEvent.starts_at)}::timestamptz is distinct from updated_event.starts_at
    or ${mapNullableDateValue(lockedEvent.ends_at)}::timestamptz is distinct from updated_event.ends_at
    or ${lockedEvent.recurrence_frequency}::text is distinct from updated_event.recurrence_frequency
    or ${mapNullableDateValue(lockedEvent.recurrence_until)}::timestamptz is distinct from updated_event.recurrence_until
  )`;
}

export class PostgresTribeEventRepository implements TribeEventRepository {
  constructor(private readonly executeWithDatabase: TribeEventDatabaseExecutor) {}

  async listByTribeRange({
    rangeEnd,
    rangeStart,
    tribeSlug,
  }: ListTribeEventsByRangeQuery): Promise<TribeEventRangeListing> {
    return this.executeWithDatabase(async (database) => {
      const eventsResult = await database.execute(
        buildEventsInRangeQuery({ rangeEnd, rangeStart, tribeSlug })
      );
      const eventRows = (eventsResult.rows ?? []) as EventListRow[];
      const events = mapEventRows(eventRows);
      const viewerPermissions = {
        canManageEvents: Boolean(eventRows[0]?.can_manage_events),
        canProposeEvents: Boolean(eventRows[0]?.can_propose_events),
      };
      const pendingProposalCount = mapCount(eventRows[0]?.pending_proposal_count ?? null);

      if (events.length === 0) {
        return {
          attendances: [],
          events,
          exceptions: [],
          pendingProposalCount,
          viewerPermissions,
        };
      }

      const exceptions = await listExceptionsInRange(database, {
        rangeEnd,
        rangeStart,
        tribeSlug,
      });
      const attendanceResult = await database.execute(
        buildAttendanceSummaryQuery({ includeMovedIn: true, rangeEnd, rangeStart, tribeSlug })
      );
      const attendanceRows = (attendanceResult.rows ?? []) as AttendanceSummaryRow[];

      return {
        attendances: attendanceRows.map(mapAttendanceSummary),
        events,
        exceptions,
        pendingProposalCount,
        viewerPermissions,
      };
    });
  }

  async listEventOccurrences({
    eventId,
    rangeEnd,
    rangeStart,
    tribeSlug,
  }: ListTribeEventOccurrencesQuery): Promise<TribeEventOccurrenceListing> {
    return this.executeWithDatabase(async (database) => {
      const event = await this.findEventRow(database, { eventId, tribeSlug });

      if (!event) {
        return { attendances: [], event: null, exceptions: [] };
      }

      const exceptions = await listExceptionsInRange(database, {
        eventId,
        rangeEnd,
        rangeStart,
        tribeSlug,
      });
      const attendanceResult = await database.execute(
        buildAttendanceSummaryQuery({
          eventId,
          includeMovedIn: true,
          rangeEnd,
          rangeStart,
          tribeSlug,
        })
      );

      return {
        attendances: ((attendanceResult.rows ?? []) as AttendanceSummaryRow[]).map(
          mapAttendanceSummary
        ),
        event,
        exceptions,
      };
    });
  }

  /**
   * One statement reads the series overlapping `eventRange` (including series
   * with a date moved into it), per series its exceptions and the viewer
   * answers inside `viewerAttendanceRange`, plus the answers of dates moved
   * into it from an earlier original start (answers keep the original
   * start). Under the request transaction's
   * READ COMMITTED isolation every statement gets its own snapshot, so
   * splitting this into several statements (or request transactions) could
   * pair the answers, the exceptions, or the upcoming schedule with a
   * different version of the series. A single statement sees one snapshot
   * without raising the isolation level, which `withRequestContext` cannot do
   * because it already ran its `set_config` statements when the callback
   * starts (`SET TRANSACTION ISOLATION LEVEL` must precede any query).
   *
   * The same statement returns `statement_timestamp()` as the reference
   * instant of the streak: attendance writes refuse ended occurrences with
   * the database clock, so the caller must decide "finished" with that clock
   * and not with the application host clock. `statement_timestamp()` (not
   * `clock_timestamp()`) because it is one value for every row and it is
   * taken when the statement starts, before its snapshot, so an occurrence
   * counted as finished already ended when the snapshot was taken. `now()`
   * would be the earlier start of the request transaction.
   */
  async readViewerAttendanceStreakSnapshot({
    eventRange,
    tribeSlug,
    viewerAttendanceRange,
  }: ReadViewerAttendanceStreakSnapshotQuery): Promise<TribeEventViewerAttendanceHistory> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(
        buildEventsInRangeQuery({ ...eventRange, tribeSlug, viewerAttendanceRange })
      );
      const rows = (result.rows ?? []) as EventWithViewerAttendancesRow[];
      const referenceTime = rows[0]?.snapshot_reference_time ?? null;

      if (!referenceTime) {
        throw new Error(
          `PostgresTribeEventRepository:readViewerAttendanceStreakSnapshot returned no database reference time for tribe "${tribeSlug}"`
        );
      }

      return {
        events: mapEventRows(rows),
        exceptions: mapSnapshotExceptions(rows),
        referenceTime: mapDateValue(referenceTime),
        viewerAttendances: mapViewerAttendances(rows),
      };
    });
  }

  async findById(query: FindTribeEventQuery): Promise<TribeEvent | null> {
    return this.executeWithDatabase((database) => this.findEventRow(database, query));
  }

  private async findEventRow(
    database: RequestDatabase,
    { eventId, tribeSlug }: FindTribeEventQuery
  ): Promise<TribeEvent | null> {
    const result = await database.execute(sql`
      select ${TRIBE_EVENT_COLUMNS}
      from public.events
      inner join public.tribes
        on tribes.id = events.tribe_id
      where tribes.slug = ${tribeSlug}
        and events.id = ${eventId}
        and public.can_read_tribe_content(tribes.id)
      limit 1
    `);
    const row = (result.rows?.[0] ?? null) as TribeEventRow | null;

    return row ? mapTribeEvent(row) : null;
  }

  async create(command: PersistTribeEventCommand): Promise<TribeEventCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        inserted_event as (
          insert into public.events as events (
            tribe_id,
            created_by,
            capacity,
            title,
            description,
            meeting_url,
            starts_at,
            ends_at,
            recurrence_frequency,
            recurrence_until,
            event_type,
            created_at,
            updated_at
          )
          select
            target_tribe.id,
            public.current_app_user_id(),
            ${command.capacity},
            ${command.title},
            ${command.description},
            ${command.meetingUrl},
            ${command.startsAt},
            ${command.endsAt},
            ${command.recurrenceFrequency},
            ${command.recurrenceUntil},
            ${command.eventType},
            timezone('utc', now()),
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_events(target_tribe.id)
          ${RETURNING_TRIBE_EVENT_COLUMNS}
        )
        select
          case
            when exists (select 1 from inserted_event) then ${TRIBE_EVENT_MUTATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status,
          inserted_event.id,
          inserted_event.capacity,
          inserted_event.title,
          inserted_event.description,
          inserted_event.meeting_url,
          inserted_event.starts_at,
          inserted_event.ends_at,
          inserted_event.recurrence_frequency,
          inserted_event.recurrence_until,
          inserted_event.event_type
        from (select 1) result
        left join inserted_event
          on true
      `);

      return mapCreationResult((result.rows?.[0] ?? null) as EventMutationRow | null);
    });
  }

  /**
   * Updates the series and, only when its capacity or schedule really changed,
   * refills the waitlists in the same transaction. A capacity marked as
   * `unchanged` is left out of the SET list, so a body that omits the field
   * keeps the stored limit and never promotes the whole queue.
   *
   * The change is detected against the row locked `FOR UPDATE` by a first
   * statement, not against a CTE of the UPDATE statement: under READ
   * COMMITTED a CTE keeps the statement snapshot while a blocked UPDATE ends
   * up rewriting the version a concurrent manager committed, so an edit
   * 10 -> 5 followed by a waiting 5 -> 10 compared 10 with 10 and skipped the
   * refill. Once the lock is held no other transaction can change the row,
   * so the captured values are exactly the version the UPDATE replaces.
   * Lock order stays event row first: the attendance functions take the same
   * row `FOR SHARE` before their occurrence advisory lock, and the refill
   * function takes it `FOR UPDATE` again (already held, so it never waits).
   */
  async update(command: PersistTribeEventUpdateCommand): Promise<TribeEventUpdateResult> {
    const capacityAssignment =
      command.capacity.kind === TRIBE_EVENT_CAPACITY_UPDATE_KIND.set
        ? sql`capacity = ${command.capacity.capacity},`
        : sql``;

    return this.executeWithDatabase(async (database) => {
      const lockedEvent = await this.lockEventForUpdate(database, command);
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_event as (
          select events.id
          from public.events
          inner join target_tribe
            on target_tribe.id = events.tribe_id
          where events.id = ${command.eventId}
          limit 1
        ),
        updated_event as (
          update public.events
          set
            ${capacityAssignment}
            title = ${command.title},
            description = ${command.description},
            meeting_url = ${command.meetingUrl},
            starts_at = ${command.startsAt},
            ends_at = ${command.endsAt},
            recurrence_frequency = ${command.recurrenceFrequency},
            recurrence_until = ${command.recurrenceUntil},
            event_type = ${command.eventType},
            -- Stamped after lockEventForUpdate waited: now() is the older
            -- transaction start and would move the calendar revision
            -- (LAST-MODIFIED) backward while calendar_sequence moves forward.
            updated_at = timezone('utc', clock_timestamp())
          from target_tribe
          where events.id = ${command.eventId}
            and events.tribe_id = target_tribe.id
            and public.can_manage_tribe_events(target_tribe.id)
          ${RETURNING_TRIBE_EVENT_COLUMNS}
        )
        select
          case
            when exists (select 1 from updated_event) then ${TRIBE_EVENT_MUTATION_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_event) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status,
          updated_event.id,
          updated_event.capacity,
          updated_event.title,
          updated_event.description,
          updated_event.meeting_url,
          updated_event.starts_at,
          updated_event.ends_at,
          updated_event.recurrence_frequency,
          updated_event.recurrence_until,
          updated_event.event_type,
          ${buildWaitlistRefillNeededExpression(lockedEvent)} as waitlist_refill_needed
        from (select 1) result
        left join updated_event
          on true
      `);
      const updateRow = (result.rows?.[0] ?? null) as EventUpdateRow | null;
      const updateResult = mapUpdateResult(updateRow);

      if (updateResult.status !== TRIBE_EVENT_MUTATION_STATUS.updated) {
        return updateResult;
      }

      if (updateRow?.waitlist_refill_needed !== false) {
        await this.refillWaitlists(database, command.eventId, updateResult.event);
      }

      if (!command.attendanceRange) {
        return { ...updateResult, attendances: [] };
      }

      // A second statement sees the promotions committed by the refill, so
      // the response reflects them; one aggregated query covers the range.
      const attendanceResult = await database.execute(
        buildAttendanceSummaryQuery({
          ...command.attendanceRange,
          eventId: command.eventId,
          includeMovedIn: true,
          tribeSlug: command.tribeSlug,
        })
      );
      const attendanceRows = (attendanceResult.rows ?? []) as AttendanceSummaryRow[];

      return { ...updateResult, attendances: attendanceRows.map(mapAttendanceSummary) };
    });
  }

  /**
   * Locks the event row `FOR UPDATE` (only when the viewer can manage it, so a
   * plain member never blocks managers) and returns its capacity and schedule
   * as they are once the lock is granted: a concurrent edit that committed
   * while this statement waited is already included. `FOR UPDATE` matches the
   * mode the waitlist refill takes later in this transaction, so the
   * transaction never upgrades a weaker row lock halfway.
   */
  private async lockEventForUpdate(
    database: RequestDatabase,
    { eventId, tribeSlug }: Pick<PersistTribeEventUpdateCommand, "eventId" | "tribeSlug">
  ): Promise<LockedEventRow | null> {
    const result = await database.execute(sql`
      select
        events.capacity,
        events.starts_at,
        events.ends_at,
        events.recurrence_frequency,
        events.recurrence_until
      from public.events
      inner join public.tribes
        on tribes.id = events.tribe_id
      where tribes.slug = ${tribeSlug}
        and events.id = ${eventId}
        and public.can_manage_tribe_events(events.tribe_id)
      for update of events
    `);

    return (result.rows?.[0] ?? null) as LockedEventRow | null;
  }

  async delete(command: DeleteTribeEventRepositoryCommand): Promise<TribeEventDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_event as (
          select events.id
          from public.events
          inner join target_tribe
            on target_tribe.id = events.tribe_id
          where events.id = ${command.eventId}
          limit 1
        ),
        deleted_event as (
          delete from public.events
          where events.id = ${command.eventId}
            and events.tribe_id = (select id from target_tribe)
            and public.can_manage_tribe_events(events.tribe_id)
          returning events.id
        )
        select
          case
            when exists (select 1 from deleted_event) then ${TRIBE_EVENT_MUTATION_STATUS.deleted}
            when not exists (select 1 from target_tribe) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_event) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status
      `);

      return mapDeletionResult((result.rows?.[0] ?? null) as EventDeletionRow | null);
    });
  }

  async setAttendance(
    command: SetTribeEventAttendanceRepositoryCommand
  ): Promise<TribeEventAttendanceResult> {
    return this.respondToOccurrence(command, command.status);
  }

  async clearAttendance(
    command: TribeEventAttendanceWriteCommand
  ): Promise<TribeEventAttendanceResult> {
    return this.respondToOccurrence(command, null);
  }

  async getOccurrenceAttendanceReport({
    eventId,
    occurrenceStartsAt,
    trendOccurrenceStartsAts,
    tribeSlug,
  }: GetTribeEventAttendanceReportQuery): Promise<TribeEventAttendanceReportLookup> {
    return this.executeWithDatabase(async (database) => {
      const accessResult = await database.execute(sql`
        select
          case
            when events.id is null then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            when public.can_manage_tribe_events(events.tribe_id) then ${TRIBE_EVENT_MUTATION_STATUS.found}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status
        from (select 1) access_anchor
        left join public.events
          on events.id = ${eventId}
          and events.tribe_id = (
            select tribes.id from public.tribes where tribes.slug = ${tribeSlug} limit 1
          )
      `);
      const accessStatus =
        ((accessResult.rows?.[0] ?? null) as ReportAccessRow | null)?.status ?? null;

      if (accessStatus !== TRIBE_EVENT_MUTATION_STATUS.found) {
        return { status: mapFailureStatus(accessStatus) };
      }

      const statusOrder = sql.join(
        ATTENDEE_STATUS_ORDER.map((status) => sql`${status}`),
        SQL_LIST_SEPARATOR
      );
      const attendeesResult = await database.execute(sql`
        select
          attendee_users.name,
          event_attendances.status,
          event_attendances.responded_at
        from public.event_attendances
        inner join public."user" attendee_users
          on attendee_users.id = event_attendances.user_id
        where event_attendances.event_id = ${eventId}
          and event_attendances.occurrence_starts_at = ${occurrenceStartsAt}
          and public.can_manage_tribe_events(event_attendances.tribe_id)
        order by
          array_position(array[${statusOrder}]::text[], event_attendances.status) asc,
          event_attendances.responded_at asc,
          event_attendances.id asc
      `);
      const attendees = ((attendeesResult.rows ?? []) as AttendeeRow[]).flatMap((row) => {
        const attendee = mapAttendee(row);

        return attendee ? [attendee] : [];
      });

      if (trendOccurrenceStartsAts.length === 0) {
        return { attendees, status: TRIBE_EVENT_MUTATION_STATUS.found, trend: [] };
      }

      const trendStarts = sql.join(
        trendOccurrenceStartsAts.map((trendStart) => sql`${trendStart}::timestamptz`),
        SQL_LIST_SEPARATOR
      );
      const trendResult = await database.execute(sql`
        select
          event_attendances.occurrence_starts_at,
          count(*) filter (
            where event_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.going}
          ) as going_count
        from public.event_attendances
        where event_attendances.event_id = ${eventId}
          and event_attendances.occurrence_starts_at in (${trendStarts})
          and public.can_manage_tribe_events(event_attendances.tribe_id)
        group by event_attendances.occurrence_starts_at
      `);

      return {
        attendees,
        status: TRIBE_EVENT_MUTATION_STATUS.found,
        trend: ((trendResult.rows ?? []) as TrendRow[]).map((row) => ({
          goingCount: mapCount(row.going_count),
          occurrenceStartsAt: mapDateValue(row.occurrence_starts_at),
        })),
      };
    });
  }

  /**
   * A raised (or removed) capacity frees seats: promotes the waitlists of the
   * occurrences that are still valid under the UPDATED schedule and have not
   * ended (in progress included), in the same transaction, which already
   * holds the event row lock taken before the UPDATE. Rows of dates removed by a
   * schedule edit stay as history and are never promoted. Exceptions keep the
   * stable key `eventId@originalStartsAt`: cancelled dates are skipped and a
   * moved date is refilled under its original start; the refill function
   * decides "ended" with its effective (moved) end. The recurrence
   * rules live only in the domain, so the valid starts are computed here and
   * passed to the SECURITY DEFINER function, which only intersects them with
   * the rows that are actually waitlisted. The application clock never
   * decides whether an occurrence ended: the candidate lower bound is the
   * database clock minus one occurrence duration, and the function skips the
   * occurrences that already ended with `clock_timestamp()` under the lock.
   */
  private async refillWaitlists(
    database: RequestDatabase,
    eventId: string,
    updatedEvent: TribeEvent
  ): Promise<void> {
    const lookbackDurationMs = getWaitlistRefillLookbackDurationMs(updatedEvent);
    // Rows keep the original start: a date moved later can still be ahead
    // even when its original start is older than the lookback bound.
    const candidateResult = await database.execute(sql`
      select distinct event_attendances.occurrence_starts_at
      from public.event_attendances
      where event_attendances.event_id = ${eventId}
        and event_attendances.status = ${TRIBE_EVENT_ATTENDANCE_STATUS.waitlisted}
        and (
          event_attendances.occurrence_starts_at
            >= clock_timestamp() - ${lookbackDurationMs}::double precision * interval '1 millisecond'
          or exists (
            select 1
            from public.event_occurrence_exceptions moved_exceptions
            where moved_exceptions.event_id = event_attendances.event_id
              and moved_exceptions.original_starts_at = event_attendances.occurrence_starts_at
              and moved_exceptions.kind = ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved}
          )
        )
    `);
    const candidateStarts = ((candidateResult.rows ?? []) as WaitlistedOccurrenceRow[]).map(
      (row) => mapDateValue(row.occurrence_starts_at)
    );

    if (candidateStarts.length === 0) {
      return;
    }

    const exceptionsResult = await database.execute(sql`
      select ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_COLUMNS}
      from public.event_occurrence_exceptions
      where event_occurrence_exceptions.event_id = ${eventId}
    `);
    const refillableStarts = selectRefillableWaitlistOccurrenceStarts(
      updatedEvent,
      candidateStarts,
      mapTribeEventOccurrenceExceptions(
        (exceptionsResult.rows ?? []) as TribeEventOccurrenceExceptionRow[]
      )
    );

    if (refillableStarts.length === 0) {
      return;
    }

    const refillableStartsArray = sql.join(
      refillableStarts.map((startsAt) => sql`${startsAt}::timestamptz`),
      SQL_LIST_SEPARATOR
    );

    await database.execute(sql`
      select public.refill_tribe_event_waitlists(
        ${eventId}::uuid,
        array[${refillableStartsArray}]::timestamptz[]
      ) as promoted_count
    `);
  }

  /**
   * Stores (or clears, with `null`) the viewer answer through the SECURITY
   * DEFINER function that assigns going/waitlisted and promotes the waitlist
   * atomically, then reads the fresh summary of that occurrence in the same
   * transaction so the response already reflects the promotions it caused.
   * The validated schedule travels with the write: the function compares it
   * with the locked event row and refuses (`schedule_changed`) when a manager
   * edited the schedule after the occurrence was validated.
   */
  private async respondToOccurrence(
    { schedule, ...key }: TribeEventAttendanceWriteCommand,
    requestedStatus: TribeEventAttendanceOption | null
  ): Promise<TribeEventAttendanceResult> {
    return this.executeWithDatabase(async (database) => {
      const responseResult = await database.execute(sql`
        select outcome, attendance_status, promoted_count
        from public.respond_to_tribe_event_occurrence(
          ${key.tribeSlug},
          ${key.eventId}::uuid,
          ${key.occurrenceStartsAt}::timestamptz,
          ${requestedStatus}::text,
          ${schedule.startsAt}::timestamptz,
          ${schedule.endsAt}::timestamptz,
          ${schedule.recurrenceFrequency}::text,
          ${schedule.recurrenceUntil}::timestamptz
        )
      `);
      const response = (responseResult.rows?.[0] ?? null) as AttendanceResponseRow | null;
      const outcome = response?.outcome ?? null;

      if (
        outcome !== ATTENDANCE_RESPONSE_OUTCOME.saved &&
        outcome !== ATTENDANCE_RESPONSE_OUTCOME.cleared
      ) {
        return { status: mapResponseFailureStatus(outcome) };
      }

      const summaryResult = await database.execute(
        buildAttendanceSummaryQuery({
          eventId: key.eventId,
          includeMovedIn: false,
          rangeEnd: new Date(
            Date.parse(key.occurrenceStartsAt) + SINGLE_OCCURRENCE_RANGE_MS
          ).toISOString(),
          rangeMatch: TRIBE_EVENT_RANGE_MATCH.startsWithin,
          rangeStart: key.occurrenceStartsAt,
          tribeSlug: key.tribeSlug,
        })
      );
      const summaryRow = (summaryResult.rows?.[0] ?? null) as AttendanceSummaryRow | null;

      return {
        attendance: summaryRow
          ? mapAttendanceSummaryFields(summaryRow)
          : createEmptyAttendanceSummary(),
        status:
          outcome === ATTENDANCE_RESPONSE_OUTCOME.saved
            ? TRIBE_EVENT_MUTATION_STATUS.attendanceSaved
            : TRIBE_EVENT_MUTATION_STATUS.attendanceCleared,
      };
    });
  }
}
