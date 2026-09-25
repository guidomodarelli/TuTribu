import { sql } from "drizzle-orm";

import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
import type { TribeEventOccurrenceKeyQuery } from "@/src/modules/events/domain/repositories/tribe-event-post-event-repository";
import {
  lockViewerMembership,
  TRIBE_EVENT_OCCURRENCE_DURATION,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-sql";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Authoritative checks of a post-event write (recording, materials,
 * reactions, comments) taken inside the write transaction. The use case
 * resolves the occurrence in earlier transactions; a manager could cancel or
 * move the date, or edit the schedule so the instant is no longer a slot, in
 * between, and the runtime role bypasses RLS. The write therefore takes, in
 * the global lock order of the events module:
 *
 * 1. the viewer's membership `FOR SHARE` (`lockViewerMembership`), so a
 *    demotion, block, or removal waits for the write;
 * 2. the event row `FOR SHARE`: schedule edits and exception writes lock it
 *    `FOR UPDATE`, so the schedule and the exception of the date cannot
 *    change until the write commits;
 * 3. (resources only) the occurrence advisory lock of the caller.
 *
 * The guard is read in a statement after the locks, so its snapshot already
 * sees whatever committed while they waited, and "finished" uses
 * `clock_timestamp()` because the transaction may have waited.
 */

export type TribeEventOccurrenceWriteGuard = {
  canManage: boolean;
  canParticipate: boolean;
  isCancelled: boolean;
  isFinished: boolean;
  isOccurrence: boolean;
  tribeId: string;
};

type OccurrenceWriteGuardRow = {
  can_manage: boolean | null;
  can_participate: boolean | null;
  can_read: boolean | null;
  is_cancelled: boolean | null;
  is_finished: boolean | null;
  is_occurrence: boolean | null;
  tribe_id: string | null;
};

/** Failures of any write: missing event or instant that is not a slot. */
export type TribeEventOccurrenceSlotFailureStatus =
  | typeof TRIBE_EVENT_MUTATION_STATUS.invalidOccurrence
  | typeof TRIBE_EVENT_MUTATION_STATUS.notFound;

/** Failures of a write that needs a finished, non-cancelled date. */
export type TribeEventFinishedOccurrenceFailureStatus =
  | TribeEventOccurrenceSlotFailureStatus
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled
  | typeof TRIBE_EVENT_MUTATION_STATUS.occurrenceNotFinished;

/**
 * Takes the membership and event row locks (steps 1 and 2), each in its own
 * statement. A missing event locks nothing; the guard read reports it.
 */
export async function lockTribeEventOccurrenceForWrite(
  database: RequestDatabase,
  { eventId, tribeSlug }: TribeEventOccurrenceKeyQuery
): Promise<void> {
  await lockViewerMembership(database, tribeSlug);
  await database.execute(sql`
    select events.id
    from public.events
    inner join public.tribes
      on tribes.id = events.tribe_id
    where tribes.slug = ${tribeSlug}
      and events.id = ${eventId}
    for share of events
  `);
}

/**
 * Reads the permissions of the viewer and the state of the slot under the
 * locks: whether the instant is still a slot of the current schedule
 * (`is_tribe_event_series_occurrence`, the SQL mirror of the domain rule),
 * whether its exception cancels it, and whether its effective end (the new
 * end of a moved date, else the slot plus the series duration, the same rule
 * as `resolveTribeEventOccurrenceSlot`) already passed.
 *
 * @returns The guard, or null when the event is missing or not readable.
 */
async function readTribeEventOccurrenceWriteGuard(
  database: RequestDatabase,
  { eventId, originalStartsAt, tribeSlug }: TribeEventOccurrenceKeyQuery
): Promise<TribeEventOccurrenceWriteGuard | null> {
  const result = await database.execute(sql`
    select
      events.tribe_id,
      public.can_read_tribe_content(events.tribe_id) as can_read,
      public.can_manage_tribe_events(events.tribe_id) as can_manage,
      public.is_active_tribe_member(events.tribe_id) as can_participate,
      public.is_tribe_event_series_occurrence(
        ${originalStartsAt}::timestamptz,
        events.starts_at,
        events.recurrence_frequency,
        events.recurrence_until
      ) as is_occurrence,
      coalesce(
        occurrence_exception.kind = ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled},
        false
      ) as is_cancelled,
      (
        case
          when occurrence_exception.kind = ${TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved}
            and occurrence_exception.new_starts_at is not null then
            coalesce(
              occurrence_exception.new_ends_at,
              occurrence_exception.new_starts_at + ${TRIBE_EVENT_OCCURRENCE_DURATION}
            )
          else ${originalStartsAt}::timestamptz + ${TRIBE_EVENT_OCCURRENCE_DURATION}
        end
      ) <= clock_timestamp() as is_finished
    from public.events
    inner join public.tribes
      on tribes.id = events.tribe_id
    left join public.event_occurrence_exceptions occurrence_exception
      on occurrence_exception.event_id = events.id
      and occurrence_exception.original_starts_at = ${originalStartsAt}::timestamptz
    where tribes.slug = ${tribeSlug}
      and events.id = ${eventId}
    limit 1
  `);
  const row = (result.rows?.[0] ?? null) as OccurrenceWriteGuardRow | null;

  if (!row?.tribe_id || !row.can_read) {
    return null;
  }

  return {
    canManage: Boolean(row.can_manage),
    canParticipate: Boolean(row.can_participate),
    isCancelled: Boolean(row.is_cancelled),
    isFinished: Boolean(row.is_finished),
    isOccurrence: Boolean(row.is_occurrence),
    tribeId: row.tribe_id,
  };
}

export type TribeEventOccurrenceWriteTarget<
  FailureStatus extends TribeEventFinishedOccurrenceFailureStatus,
> =
  | { guard: TribeEventOccurrenceWriteGuard; isAccepted: true }
  | { isAccepted: false; status: FailureStatus };

/**
 * Reads the guard (`readTribeEventOccurrenceWriteGuard`) and applies the
 * slot checks in the order the use case reports them: missing event, instant
 * that is not a slot, then (finished-only writes) cancelled and not yet
 * finished dates. Permissions stay with each caller.
 *
 * @param requiresFinishedSlot - Whether the write needs a finished,
 * non-cancelled date (recording, materials, a new reaction).
 * @returns The guard when the slot accepts the write, else its failure.
 */
export async function readTribeEventOccurrenceWriteTarget(
  database: RequestDatabase,
  key: TribeEventOccurrenceKeyQuery,
  requiresFinishedSlot: false
): Promise<TribeEventOccurrenceWriteTarget<TribeEventOccurrenceSlotFailureStatus>>;
export async function readTribeEventOccurrenceWriteTarget(
  database: RequestDatabase,
  key: TribeEventOccurrenceKeyQuery,
  requiresFinishedSlot: boolean
): Promise<TribeEventOccurrenceWriteTarget<TribeEventFinishedOccurrenceFailureStatus>>;
export async function readTribeEventOccurrenceWriteTarget(
  database: RequestDatabase,
  key: TribeEventOccurrenceKeyQuery,
  requiresFinishedSlot: boolean
): Promise<TribeEventOccurrenceWriteTarget<TribeEventFinishedOccurrenceFailureStatus>> {
  const guard = await readTribeEventOccurrenceWriteGuard(database, key);

  if (!guard) {
    return { isAccepted: false, status: TRIBE_EVENT_MUTATION_STATUS.notFound };
  }

  if (!guard.isOccurrence) {
    return { isAccepted: false, status: TRIBE_EVENT_MUTATION_STATUS.invalidOccurrence };
  }

  if (requiresFinishedSlot && guard.isCancelled) {
    return { isAccepted: false, status: TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled };
  }

  if (requiresFinishedSlot && !guard.isFinished) {
    return { isAccepted: false, status: TRIBE_EVENT_MUTATION_STATUS.occurrenceNotFinished };
  }

  return { guard, isAccepted: true };
}
