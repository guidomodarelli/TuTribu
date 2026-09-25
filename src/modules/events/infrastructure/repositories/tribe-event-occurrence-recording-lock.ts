import { sql } from "drizzle-orm";

import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  readTribeEventOccurrenceWriteTarget,
  type TribeEventFinishedOccurrenceFailureStatus,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-occurrence-write-guard";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Occurrence whose recording another module's transaction needs to hold:
 * the series slot plus the tribe that must own the recording (by id, and by
 * slug for the occurrence guard).
 */
export type TribeEventOccurrenceRecordingLockKey = {
  eventId: string;
  originalStartsAt: string;
  tribeId: string;
  tribeSlug: string;
};

/**
 * Video of the recording as it stands under the share lock.
 */
export type HeldTribeEventOccurrenceRecording = {
  externalVideoId: string;
  provider: VideoProvider;
};

/**
 * Outcome of holding the source of a conversion: the occurrence is still a
 * finished, non-cancelled slot and its recording (null when it was removed)
 * is held until commit; or the occurrence no longer accepts it.
 */
export type TribeEventOccurrenceRecordingSourceHold =
  | { isHeld: true; recording: HeldTribeEventOccurrenceRecording | null }
  | { isHeld: false; status: TribeEventFinishedOccurrenceFailureStatus };

type HeldRecordingRow = {
  external_video_id: string;
  video_provider: VideoProvider;
};

/**
 * Holds the source occurrence of another module's transaction (the
 * "Convertir en lección" conversion of courses) until it commits:
 *
 * 1. the event row `FOR SHARE`: schedule edits (a longer series end, a new
 *    recurrence) and exception writes (cancel or move the date) lock it
 *    `FOR UPDATE`, so they cannot change the occurrence until the caller
 *    commits, and one committed while this statement waited is seen next;
 * 2. the recording row `FOR SHARE`: a replacement or removal
 *    (`saveResources`) committed meanwhile is what it reads, one issued later
 *    waits for the caller;
 * 3. the occurrence guard (`readTribeEventOccurrenceWriteTarget`), read
 *    after both locks with `clock_timestamp()`: the instant must still be a
 *    slot, not cancelled, and its effective end must have passed.
 *
 * The events module owns this SQL so other modules never read the events
 * schema: the composition root injects it into the adapter that needs it.
 * The caller runs it as its LAST lock, after its own rows, and locks nothing
 * of events afterwards. `saveResources` locks membership → event
 * (`FOR SHARE`, compatible) → occurrence advisory → recording row, and the
 * schedule and exception writes lock membership → event `FOR UPDATE` without
 * touching the caller's rows (course modules, conversion advisory lock), so
 * event → recording here cannot close a cycle with either.
 *
 * @param database - Transaction of the caller.
 * @param key - Occurrence and owning tribe of the recording.
 * @returns The held recording, or the reason the occurrence rejects it.
 */
export async function lockTribeEventOccurrenceRecordingForShare(
  database: RequestDatabase,
  { eventId, originalStartsAt, tribeId, tribeSlug }: TribeEventOccurrenceRecordingLockKey
): Promise<TribeEventOccurrenceRecordingSourceHold> {
  await database.execute(sql`
    select events.id
    from public.events
    where events.id = ${eventId}
      and events.tribe_id = ${tribeId}::uuid
    for share of events
  `);

  const recordingResult = await database.execute(sql`
    select
      event_occurrence_recordings.video_provider,
      event_occurrence_recordings.external_video_id
    from public.event_occurrence_recordings
    where event_occurrence_recordings.event_id = ${eventId}
      and event_occurrence_recordings.original_starts_at = ${originalStartsAt}::timestamptz
      and event_occurrence_recordings.tribe_id = ${tribeId}::uuid
    for share of event_occurrence_recordings
  `);
  const target = await readTribeEventOccurrenceWriteTarget(
    database,
    { eventId, originalStartsAt, tribeSlug },
    true
  );

  if (!target.isAccepted) {
    return { isHeld: false, status: target.status };
  }

  if (target.guard.tribeId !== tribeId) {
    return { isHeld: false, status: TRIBE_EVENT_MUTATION_STATUS.notFound };
  }

  const row = (recordingResult.rows?.[0] ?? null) as HeldRecordingRow | null;

  return {
    isHeld: true,
    recording: row
      ? { externalVideoId: row.external_video_id, provider: row.video_provider }
      : null,
  };
}
