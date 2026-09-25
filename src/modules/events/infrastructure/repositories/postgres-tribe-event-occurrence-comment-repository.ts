import { sql } from "drizzle-orm";

import { TRIBE_EVENT_POST_EVENT_LIMIT } from "@/src/modules/events/constants/tribe-event-post-event";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type { TribeEventOccurrenceComment } from "@/src/modules/events/domain/entities/tribe-event-post-event";
import type {
  CreateTribeEventOccurrenceCommentCommand,
  DeleteTribeEventOccurrenceCommentCommand,
  TribeEventOccurrenceCommentCreateResult,
  TribeEventOccurrenceCommentDeleteResult,
  TribeEventOccurrenceCommentListResult,
  TribeEventOccurrenceCommentRepository,
  TribeEventOccurrenceKeyQuery,
} from "@/src/modules/events/domain/repositories/tribe-event-post-event-repository";
import {
  lockTribeEventOccurrenceForWrite,
  readTribeEventOccurrenceWriteTarget,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-occurrence-write-guard";
import {
  mapDateValue,
  type TribeEventDatabaseExecutor,
} from "@/src/modules/events/infrastructure/repositories/tribe-event-sql";

/**
 * Postgres adapter of the occurrence conversation. Reads repeat
 * `can_read_tribe_content`; writing repeats `is_active_tribe_member`;
 * deleting repeats "author or event manager" (the runtime role bypasses
 * RLS). Author names and avatars come from "user"; the email is never read.
 */

type CommentRow = {
  author_image_url: string | null;
  author_name: string | null;
  can_delete: boolean | null;
  content: string;
  created_at: Date | string;
  id: string;
};

type CommentListRow = {
  can_comment: boolean | null;
  comments: unknown;
};

type CommentMutationRow = Partial<CommentRow> & {
  status: string | null;
};

function mapComment(row: CommentRow): TribeEventOccurrenceComment {
  return {
    authorImageUrl: row.author_image_url,
    authorName: row.author_name ?? "",
    canDelete: Boolean(row.can_delete),
    content: row.content,
    createdAt: mapDateValue(row.created_at),
    id: row.id,
  };
}

function mapCommentRows(value: unknown): TribeEventOccurrenceComment[] {
  return Array.isArray(value) ? (value as CommentRow[]).map(mapComment) : [];
}

function mapFailureStatus(
  status: string | null | undefined
): typeof TRIBE_EVENT_MUTATION_STATUS.forbidden | typeof TRIBE_EVENT_MUTATION_STATUS.notFound {
  return status === TRIBE_EVENT_MUTATION_STATUS.notFound
    ? TRIBE_EVENT_MUTATION_STATUS.notFound
    : TRIBE_EVENT_MUTATION_STATUS.forbidden;
}

export class PostgresTribeEventOccurrenceCommentRepository
  implements TribeEventOccurrenceCommentRepository
{
  constructor(private readonly executeWithDatabase: TribeEventDatabaseExecutor) {}

  /**
   * Oldest first, bounded to the most recent `commentListSize` comments.
   */
  async list({
    eventId,
    originalStartsAt,
    tribeSlug,
  }: TribeEventOccurrenceKeyQuery): Promise<TribeEventOccurrenceCommentListResult> {
    return this.executeWithDatabase(async (database) => {
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
        ),
        recent_comments as (
          select
            event_occurrence_comments.id,
            event_occurrence_comments.content,
            event_occurrence_comments.created_at,
            event_occurrence_comments.author_id
          from public.event_occurrence_comments
          inner join target_event
            on target_event.id = event_occurrence_comments.event_id
          where event_occurrence_comments.original_starts_at = ${originalStartsAt}::timestamptz
          order by event_occurrence_comments.created_at desc, event_occurrence_comments.id desc
          limit ${TRIBE_EVENT_POST_EVENT_LIMIT.commentListSize}
        )
        select
          public.is_active_tribe_member(target_event.tribe_id) as can_comment,
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', recent_comments.id,
                  'content', recent_comments.content,
                  'created_at', recent_comments.created_at,
                  'author_name', comment_author.name,
                  'author_image_url', comment_author.image,
                  'can_delete', (
                    recent_comments.author_id = public.current_app_user_id()
                    or public.can_manage_tribe_events(target_event.tribe_id)
                  )
                )
                order by recent_comments.created_at asc, recent_comments.id asc
              )
              from recent_comments
              inner join public."user" comment_author
                on comment_author.id = recent_comments.author_id
            ),
            '[]'::jsonb
          ) as comments
        from target_event
      `);
      const row = (result.rows?.[0] ?? null) as CommentListRow | null;

      if (!row) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.notFound };
      }

      return {
        canComment: Boolean(row.can_comment),
        comments: mapCommentRows(row.comments),
        status: TRIBE_EVENT_MUTATION_STATUS.found,
      };
    });
  }

  /**
   * Adds a comment of an active member. The slot (a real date of the current
   * schedule; cancelled dates keep their conversation) and the membership
   * are revalidated under the membership and event row locks, so a schedule
   * edit or a block that committed after the use case resolved the
   * occurrence is honored.
   */
  async create(
    command: CreateTribeEventOccurrenceCommentCommand
  ): Promise<TribeEventOccurrenceCommentCreateResult> {
    return this.executeWithDatabase(async (database) => {
      await lockTribeEventOccurrenceForWrite(database, command);

      const target = await readTribeEventOccurrenceWriteTarget(database, command, false);

      if (!target.isAccepted) {
        return { status: target.status };
      }

      if (!target.guard.canParticipate) {
        return { status: TRIBE_EVENT_MUTATION_STATUS.forbidden };
      }

      const result = await database.execute(sql`
        with target_event as (
          select events.id, events.tribe_id
          from public.events
          inner join public.tribes
            on tribes.id = events.tribe_id
          where tribes.slug = ${command.tribeSlug}
            and events.id = ${command.eventId}
            and public.can_read_tribe_content(tribes.id)
          limit 1
        ),
        inserted_comment as (
          insert into public.event_occurrence_comments (
            event_id,
            tribe_id,
            original_starts_at,
            author_id,
            content
          )
          select
            target_event.id,
            target_event.tribe_id,
            ${command.originalStartsAt}::timestamptz,
            public.current_app_user_id(),
            ${command.content}
          from target_event
          where public.is_active_tribe_member(target_event.tribe_id)
          returning
            event_occurrence_comments.id,
            event_occurrence_comments.content,
            event_occurrence_comments.created_at,
            event_occurrence_comments.author_id
        )
        select
          case
            when exists (select 1 from inserted_comment) then ${TRIBE_EVENT_MUTATION_STATUS.commentCreated}
            when not exists (select 1 from target_event) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status,
          inserted_comment.id,
          inserted_comment.content,
          inserted_comment.created_at,
          comment_author.name as author_name,
          comment_author.image as author_image_url,
          true as can_delete
        from (select 1) result
        left join inserted_comment
          on true
        left join public."user" comment_author
          on comment_author.id = inserted_comment.author_id
      `);
      const row = (result.rows?.[0] ?? null) as CommentMutationRow | null;

      if (row?.status !== TRIBE_EVENT_MUTATION_STATUS.commentCreated || !row.id) {
        return { status: mapFailureStatus(row?.status) };
      }

      return {
        comment: mapComment(row as CommentRow),
        status: TRIBE_EVENT_MUTATION_STATUS.commentCreated,
      };
    });
  }

  /**
   * Deletes a comment of the tribe when the viewer wrote it or manages
   * events. A missing comment and a foreign tribe both answer not found.
   */
  async delete({
    commentId,
    tribeSlug,
  }: DeleteTribeEventOccurrenceCommentCommand): Promise<TribeEventOccurrenceCommentDeleteResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_comment as (
          select event_occurrence_comments.id, event_occurrence_comments.tribe_id,
            event_occurrence_comments.author_id
          from public.event_occurrence_comments
          inner join public.tribes
            on tribes.id = event_occurrence_comments.tribe_id
          where tribes.slug = ${tribeSlug}
            and event_occurrence_comments.id = ${commentId}
            and public.can_read_tribe_content(tribes.id)
          limit 1
        ),
        deleted_comment as (
          delete from public.event_occurrence_comments
          using target_comment
          where event_occurrence_comments.id = target_comment.id
            and (
              target_comment.author_id = public.current_app_user_id()
              or public.can_manage_tribe_events(target_comment.tribe_id)
            )
          returning event_occurrence_comments.id
        )
        select
          case
            when exists (select 1 from deleted_comment) then ${TRIBE_EVENT_MUTATION_STATUS.commentDeleted}
            when not exists (select 1 from target_comment) then ${TRIBE_EVENT_MUTATION_STATUS.notFound}
            else ${TRIBE_EVENT_MUTATION_STATUS.forbidden}
          end as status
      `);
      const status = ((result.rows?.[0] ?? null) as { status: string | null } | null)?.status;

      return status === TRIBE_EVENT_MUTATION_STATUS.commentDeleted
        ? { status }
        : { status: mapFailureStatus(status) };
    });
  }
}
