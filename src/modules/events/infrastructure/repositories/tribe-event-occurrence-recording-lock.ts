import { sql } from "drizzle-orm";

import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Occurrence whose recording another module's transaction needs to hold:
 * the series slot plus the tribe that must own the recording.
 */
export type TribeEventOccurrenceRecordingLockKey = {
  eventId: string;
  originalStartsAt: string;
  tribeId: string;
};

/**
 * Video of the recording as it stands under the share lock.
 */
export type HeldTribeEventOccurrenceRecording = {
  externalVideoId: string;
  provider: VideoProvider;
};

type HeldRecordingRow = {
  external_video_id: string;
  video_provider: VideoProvider;
};

/**
 * Share-locks the recording of one occurrence inside the caller's
 * transaction and answers its current video, or null when the occurrence no
 * longer has one. A replacement or removal (`saveResources`) committed while
 * this statement waited is what it reads; one issued later waits for the
 * caller to commit.
 *
 * The events module owns this SQL so other modules never read the events
 * schema: the composition root injects it into the adapter that needs it
 * (the "Convertir en lección" conversion of courses). The caller runs it as
 * its LAST lock, after its own rows: `saveResources` locks membership →
 * event → occurrence advisory → recording row, so a conversion that only
 * waits here (and takes nothing of events afterwards) cannot close a cycle.
 *
 * @param database - Transaction of the caller.
 * @param key - Occurrence and owning tribe of the recording.
 * @returns The held recording video, or null when there is none.
 */
export async function lockTribeEventOccurrenceRecordingForShare(
  database: RequestDatabase,
  { eventId, originalStartsAt, tribeId }: TribeEventOccurrenceRecordingLockKey
): Promise<HeldTribeEventOccurrenceRecording | null> {
  const result = await database.execute(sql`
    select
      event_occurrence_recordings.video_provider,
      event_occurrence_recordings.external_video_id
    from public.event_occurrence_recordings
    where event_occurrence_recordings.event_id = ${eventId}
      and event_occurrence_recordings.original_starts_at = ${originalStartsAt}::timestamptz
      and event_occurrence_recordings.tribe_id = ${tribeId}::uuid
    for share of event_occurrence_recordings
  `);
  const row = (result.rows?.[0] ?? null) as HeldRecordingRow | null;

  return row
    ? { externalVideoId: row.external_video_id, provider: row.video_provider }
    : null;
}
