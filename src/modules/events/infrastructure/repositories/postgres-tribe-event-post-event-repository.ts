import { sql } from "drizzle-orm";

import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEventOccurrenceMaterial,
  TribeEventOccurrenceReactionSummary,
  TribeEventOccurrenceRecording,
} from "@/src/modules/events/domain/entities/tribe-event-post-event";
import type {
  SaveTribeEventPostEventResourcesCommand,
  SetTribeEventOccurrenceReactionCommand,
  TribeEventOccurrenceKeyQuery,
  TribeEventOccurrenceReactionResult,
  TribeEventPostEventRepository,
  TribeEventPostEventResources,
  TribeEventPostEventSaveResult,
} from "@/src/modules/events/domain/repositories/tribe-event-post-event-repository";
import {
  createEmptyTribeEventReactionSummary,
  isTribeEventOccurrenceReaction,
} from "@/src/modules/events/domain/services/tribe-event-post-event";
import {
  lockTribeEventOccurrenceForWrite,
  readTribeEventOccurrenceWriteTarget,
  type TribeEventFinishedOccurrenceFailureStatus,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-occurrence-write-guard";
import {
  mapCount,
  type TribeEventDatabaseExecutor,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-sql";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import {
  VIDEO_PROVIDER,
  type VideoProvider,
} from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * Postgres adapter of the post-event resources of an occurrence (recording,
 * materials, reactions). Reads repeat `can_read_tribe_content`; resource
 * writes repeat `can_manage_tribe_events`; reactions repeat
 * `is_active_tribe_member` and ownership (the runtime role bypasses RLS).
 * Every write revalidates the slot and the permission under the membership
 * and event row locks (`tribe-event-occurrence-write-guard`).
 */

type ResourcesRow = {
  can_manage: boolean | null;
  can_participate: boolean | null;
  external_video_id: string | null;
  materials: unknown;
  reaction_counts: unknown;
  source_url: string | null;
  video_provider: string | null;
  viewer_reaction: string | null;
};

/**
 * Advisory lock namespace of one occurrence's resources. Distinct from the
 * attendance lock (`tribe_event_occurrence:`), so saving resources never
 * waits for answers.
 */
const POST_EVENT_LOCK_PREFIX = "tribe_event_post_event:";
const ADVISORY_LOCK_SEED = 0;

function isVideoProvider(value: string | null): value is VideoProvider {
  return Object.values(VIDEO_PROVIDER).some((provider) => provider === value);
}

function mapRecording(row: ResourcesRow): TribeEventOccurrenceRecording | null {
  if (!row.external_video_id || !row.source_url || !isVideoProvider(row.video_provider)) {
    return null;
  }

  return {
    externalVideoId: row.external_video_id,
    provider: row.video_provider,
    sourceUrl: row.source_url,
  };
}

function mapMaterials(value: unknown): TribeEventOccurrenceMaterial[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const { title, url } = item as Record<string, unknown>;

    return typeof title === "string" && typeof url === "string" ? [{ title, url }] : [];
  });
}

function mapReactionSummary(
  counts: unknown,
  viewerReaction: string | null
): TribeEventOccurrenceReactionSummary {
  const summary = createEmptyTribeEventReactionSummary();

  if (counts && typeof counts === "object") {
    for (const [reaction, count] of Object.entries(counts as Record<string, unknown>)) {
      if (isTribeEventOccurrenceReaction(reaction)) {
        summary.counts[reaction] = mapCount(
          typeof count === "number" || typeof count === "string" ? count : null
        );
      }
    }
  }

  summary.viewerReaction = isTribeEventOccurrenceReaction(viewerReaction)
    ? viewerReaction
    : null;

  return summary;
}

/**
 * Aggregated reactions of one occurrence and the viewer's own reaction.
 */
function buildReactionSummarySql(eventId: string, originalStartsAt: string) {
  return sql`
    coalesce(
      (
        select jsonb_object_agg(reaction_counts.reaction, reaction_counts.total)
        from (
          select event_occurrence_reactions.reaction, count(*) as total
          from public.event_occurrence_reactions
          where event_occurrence_reactions.event_id = ${eventId}
            and event_occurrence_reactions.original_starts_at = ${originalStartsAt}::timestamptz
          group by event_occurrence_reactions.reaction
        ) reaction_counts
      ),
      '{}'::jsonb
    ) as reaction_counts,
    (
      select event_occurrence_reactions.reaction
      from public.event_occurrence_reactions
      where event_occurrence_reactions.event_id = ${eventId}
        and event_occurrence_reactions.original_starts_at = ${originalStartsAt}::timestamptz
        and event_occurrence_reactions.user_id = public.current_app_user_id()
      limit 1
    ) as viewer_reaction
  `;
}

async function readResources(
  database: RequestDatabase,
  { eventId, originalStartsAt, tribeSlug }: TribeEventOccurrenceKeyQuery
): Promise<TribeEventPostEventResources | null> {
  const result = await database.execute(sql`
    with target_event as (
      select events.id, events.tribe_id
      from public.events
      inner join public.tribes
        on tribes.id = events.tribe_id
      where tribes.slug = ${tribeSlug}
        and events.id = ${eventId}
        and public.can_read_tribe_content(tribes.id)
      limit 1
    )
    select
      public.can_manage_tribe_events(target_event.tribe_id) as can_manage,
      public.is_active_tribe_member(target_event.tribe_id) as can_participate,
      event_occurrence_recordings.video_provider,
      event_occurrence_recordings.external_video_id,
      event_occurrence_recordings.source_url,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'title', event_occurrence_materials.title,
              'url', event_occurrence_materials.url
            )
            order by event_occurrence_materials.sort_order
          )
          from public.event_occurrence_materials
          where event_occurrence_materials.event_id = target_event.id
            and event_occurrence_materials.original_starts_at = ${originalStartsAt}::timestamptz
        ),
        '[]'::jsonb
      ) as materials,
      ${buildReactionSummarySql(eventId, originalStartsAt)}
    from target_event
    left join public.event_occurrence_recordings
      on event_occurrence_recordings.event_id = target_event.id
      and event_occurrence_recordings.original_starts_at = ${originalStartsAt}::timestamptz
  `);
  const row = (result.rows?.[0] ?? null) as ResourcesRow | null;

  if (!row) {
    return null;
  }

  return {
    materials: mapMaterials(row.materials),
    reactions: mapReactionSummary(row.reaction_counts, row.viewer_reaction),
    recording: mapRecording(row),
    viewerPermissions: {
      canManageResources: Boolean(row.can_manage),
      canParticipate: Boolean(row.can_participate),
    },
  };
}

async function readReactionSummary(
  database: RequestDatabase,
  { eventId, originalStartsAt }: TribeEventOccurrenceKeyQuery
): Promise<TribeEventOccurrenceReactionSummary> {
  const result = await database.execute(sql`
    select ${buildReactionSummarySql(eventId, originalStartsAt)}
  `);
  const row = (result.rows?.[0] ?? null) as Pick<
    ResourcesRow,
    "reaction_counts" | "viewer_reaction"
  > | null;

  return mapReactionSummary(row?.reaction_counts ?? null, row?.viewer_reaction ?? null);
}

type ManagedOccurrence =
  | { isAccepted: true; tribeId: string }
  | {
      isAccepted: false;
      status: TribeEventFinishedOccurrenceFailureStatus | typeof TRIBE_EVENT_MUTATION_STATUS.forbidden;
    };

/**
 * Finished, non-cancelled slot the viewer still manages, read under the
 * locks taken so far.
 */
async function readManagedOccurrence(
  database: RequestDatabase,
  key: TribeEventOccurrenceKeyQuery
): Promise<ManagedOccurrence> {
  const target = await readTribeEventOccurrenceWriteTarget(database, key, true);

  if (!target.isAccepted) {
    return target;
  }

  return target.guard.canManage
    ? { isAccepted: true, tribeId: target.guard.tribeId }
    : { isAccepted: false, status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
}

export class PostgresTribeEventPostEventRepository implements TribeEventPostEventRepository {
  constructor(private readonly executeWithDatabase: TribeEventDatabaseExecutor) {}

  async getResources(
    query: TribeEventOccurrenceKeyQuery
  ): Promise<TribeEventPostEventResources | null> {
    return this.executeWithDatabase((database) => readResources(database, query));
  }

  /**
   * Replaces the recording (upsert, or delete when null) and the whole list
   * of materials in one transaction. Lock order: the manager's membership
   * and the event row (`lockTribeEventOccurrenceForWrite`), then an advisory
   * lock per occurrence that serializes two managers saving at once, so the
   * materials list is never interleaved (delete + insert of the same sort
   * orders). Each lock is its own statement, so the following statements get
   * a snapshot that already sees what committed while they waited.
   *
   * The guard is read after the event row lock (fail fast before queueing on
   * the advisory lock) and again after the advisory lock: the slot must
   * still be a finished, non-cancelled date of the current schedule and the
   * viewer must still manage events when the writes run, even if they waited
   * behind another save.
   *
   * Only the INSERT of a recording enqueues "event_recording_available"
   * (database trigger, same transaction); replacing the link is an UPDATE.
   */
  async saveResources(
    command: SaveTribeEventPostEventResourcesCommand
  ): Promise<TribeEventPostEventSaveResult> {
    return this.executeWithDatabase(async (database) => {
      await lockTribeEventOccurrenceForWrite(database, command);

      const lockedTarget = await readManagedOccurrence(database, command);

      if (!lockedTarget.isAccepted) {
        return { status: lockedTarget.status };
      }

      await database.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(
            ${POST_EVENT_LOCK_PREFIX}::text || ${command.eventId}::text || '@'
              || extract(epoch from ${command.originalStartsAt}::timestamptz)::text,
            ${ADVISORY_LOCK_SEED}
          )
        )
      `);

      const target = await readManagedOccurrence(database, command);

      if (!target.isAccepted) {
        return { status: target.status };
      }

      if (command.recording) {
        await database.execute(sql`
          insert into public.event_occurrence_recordings as event_occurrence_recordings (
            event_id,
            tribe_id,
            original_starts_at,
            video_provider,
            external_video_id,
            source_url,
            created_by,
            created_at,
            updated_at
          )
          values (
            ${command.eventId},
            ${target.tribeId},
            ${command.originalStartsAt}::timestamptz,
            ${command.recording.provider},
            ${command.recording.externalVideoId},
            ${command.recording.sourceUrl},
            public.current_app_user_id(),
            timezone('utc', clock_timestamp()),
            timezone('utc', clock_timestamp())
          )
          on conflict (event_id, original_starts_at) do update set
            video_provider = excluded.video_provider,
            external_video_id = excluded.external_video_id,
            source_url = excluded.source_url,
            updated_at = excluded.updated_at
          where event_occurrence_recordings.video_provider is distinct from excluded.video_provider
            or event_occurrence_recordings.external_video_id is distinct from excluded.external_video_id
            or event_occurrence_recordings.source_url is distinct from excluded.source_url
        `);
      } else {
        await database.execute(sql`
          delete from public.event_occurrence_recordings
          where event_occurrence_recordings.event_id = ${command.eventId}
            and event_occurrence_recordings.original_starts_at = ${command.originalStartsAt}::timestamptz
        `);
      }

      await database.execute(sql`
        delete from public.event_occurrence_materials
        where event_occurrence_materials.event_id = ${command.eventId}
          and event_occurrence_materials.original_starts_at = ${command.originalStartsAt}::timestamptz
      `);

      if (command.materials.length > 0) {
        await database.execute(sql`
          insert into public.event_occurrence_materials (
            event_id,
            tribe_id,
            original_starts_at,
            title,
            url,
            sort_order,
            created_by
          )
          select
            ${command.eventId},
            ${target.tribeId},
            ${command.originalStartsAt}::timestamptz,
            material.title,
            material.url,
            (material.ordinality - 1)::integer,
            public.current_app_user_id()
          from rows from (
            jsonb_to_recordset(${JSON.stringify(command.materials)}::jsonb)
              as (title text, url text)
          ) with ordinality as material(title, url, ordinality)
        `);
      }

      const resources = await readResources(database, command);

      return resources
        ? { resources, status: TRIBE_EVENT_MUTATION_STATUS.postEventSaved }
        : { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
    });
  }

  /**
   * Upserts (or deletes, with `reaction: null`) the viewer's reaction and
   * answers with the fresh counts. Only an active member of the event's tribe
   * writes; repeating the same reaction is a no-op. The slot is revalidated
   * under the membership and event row locks: a new reaction needs a
   * finished, non-cancelled date, while removing one only needs a real slot.
   */
  async setReaction(
    command: SetTribeEventOccurrenceReactionCommand
  ): Promise<TribeEventOccurrenceReactionResult> {
    return this.executeWithDatabase(async (database) => {
      await lockTribeEventOccurrenceForWrite(database, command);

      const target = await readTribeEventOccurrenceWriteTarget(
        database,
        command,
        command.reaction !== null
      );

      if (!target.isAccepted) {
        return { status: target.status };
      }

      if (command.reaction === null) {
        await database.execute(sql`
          delete from public.event_occurrence_reactions
          where event_occurrence_reactions.event_id = ${command.eventId}
            and event_occurrence_reactions.original_starts_at = ${command.originalStartsAt}::timestamptz
            and event_occurrence_reactions.user_id = public.current_app_user_id()
        `);

        return {
          reactions: await readReactionSummary(database, command),
          status: TRIBE_EVENT_MUTATION_STATUS.reactionCleared,
        };
      }

      if (!target.guard.canParticipate) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
      }

      await database.execute(sql`
        insert into public.event_occurrence_reactions as event_occurrence_reactions (
          event_id,
          tribe_id,
          original_starts_at,
          user_id,
          reaction,
          created_at,
          updated_at
        )
        values (
          ${command.eventId},
          ${target.guard.tribeId},
          ${command.originalStartsAt}::timestamptz,
          public.current_app_user_id(),
          ${command.reaction},
          timezone('utc', now()),
          timezone('utc', now())
        )
        on conflict (event_id, original_starts_at, user_id) do update set
          reaction = excluded.reaction,
          updated_at = excluded.updated_at
        where event_occurrence_reactions.reaction is distinct from excluded.reaction
      `);

      return {
        reactions: await readReactionSummary(database, command),
        status: TRIBE_EVENT_MUTATION_STATUS.reactionSaved,
      };
    });
  }
}
