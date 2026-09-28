import { sql } from "drizzle-orm";

import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import type { LessonComment } from "@/src/modules/courses/domain/entities/lesson-comment";
import type {
  CreateLessonCommentRepositoryCommand,
  DeleteLessonCommentRepositoryCommand,
  LessonCommentCreationResult,
  LessonCommentDeletionResult,
  LessonCommentListResult,
  LessonCommentRepository,
  ListLessonCommentsQuery,
} from "@/src/modules/courses/domain/repositories/lesson-comment-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

const COMMENT_LIST_STATUS = {
  ok: "ok",
} as const;

const COMMENT_MUTATION_STATUS = {
  created: "created",
  deleted: "deleted",
} as const;

type LessonCommentRow = {
  author_id: string;
  author_image_url: string | null;
  author_name: string | null;
  can_delete: boolean | null;
  content: string;
  created_at: string;
  id: string;
  lesson_id: string;
};

type CommentListRow = {
  comments: LessonCommentRow[] | null;
  status: string | null;
};

type CommentMutationRow = Partial<LessonCommentRow> & {
  status: string | null;
};

function mapComment(row: LessonCommentRow): LessonComment {
  return {
    authorId: row.author_id,
    authorImageUrl: row.author_image_url,
    authorName: row.author_name ?? "",
    canDelete: Boolean(row.can_delete),
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    lessonId: row.lesson_id,
  };
}

export class PostgresLessonCommentRepository implements LessonCommentRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByLesson(
    query: ListLessonCommentsQuery
  ): Promise<LessonCommentListResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${query.tribeSlug}
          limit 1
        ),
        viewer as (
          select
            nullif(public.current_app_user_id(), '') as user_id,
            coalesce(public.can_manage_tribe_courses((select id from target_tribe)), false) as can_manage,
            coalesce(public.can_read_tribe_courses((select id from target_tribe)), false) as can_read
        ),
        target_lesson as (
          select course_lessons.id
          from public.course_lessons
          inner join target_tribe
            on target_tribe.id = course_lessons.tribe_id
          where course_lessons.id = ${query.lessonId}
            and (
              (select can_manage from viewer)
              or (
                course_lessons.is_active = true
                and public.is_course_module_unlocked(course_lessons.course_module_id)
              )
            )
          limit 1
        )
        select
          case
            when not exists (select 1 from target_lesson) then ${COURSE_MUTATION_STATUS.notFound}
            when not (select can_read from viewer) then ${COURSE_MUTATION_STATUS.forbidden}
            else ${COMMENT_LIST_STATUS.ok}
          end as status,
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', lesson_comments.id,
                  'lesson_id', lesson_comments.lesson_id,
                  'author_id', lesson_comments.author_id,
                  'author_name', comment_author.name,
                  'author_image_url', comment_author.image,
                  'content', lesson_comments.content,
                  'created_at', to_char(
                    lesson_comments.created_at at time zone 'utc',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"'
                  ),
                  'can_delete', (
                    lesson_comments.author_id = (select user_id from viewer)
                    or (select can_manage from viewer)
                  )
                )
                order by lesson_comments.created_at asc
              )
              from public.course_lesson_comments lesson_comments
              inner join public."user" comment_author
                on comment_author.id = lesson_comments.author_id
              where lesson_comments.lesson_id = (select id from target_lesson)
            ),
            '[]'::jsonb
          ) as comments
      `);
      const row = (result.rows?.[0] ?? null) as CommentListRow | null;

      if (row?.status === COMMENT_LIST_STATUS.ok) {
        return {
          comments: (row.comments ?? []).map(mapComment),
          status: COMMENT_LIST_STATUS.ok,
        };
      }

      return {
        status:
          row?.status === COURSE_MUTATION_STATUS.notFound
            ? COURSE_MUTATION_STATUS.notFound
            : COURSE_MUTATION_STATUS.forbidden,
      };
    });
  }

  async createComment(
    command: CreateLessonCommentRepositoryCommand
  ): Promise<LessonCommentCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        viewer as (
          select
            nullif(public.current_app_user_id(), '') as user_id,
            coalesce(public.can_manage_tribe_courses((select id from target_tribe)), false) as can_manage
        ),
        target_lesson as (
          select course_lessons.id, course_lessons.tribe_id
          from public.course_lessons
          inner join target_tribe
            on target_tribe.id = course_lessons.tribe_id
          where course_lessons.id = ${command.lessonId}
            and (
              (select can_manage from viewer)
              or (
                course_lessons.is_active = true
                and public.is_course_module_unlocked(course_lessons.course_module_id)
              )
            )
          limit 1
        ),
        inserted_comment as (
          insert into public.course_lesson_comments (
            tribe_id,
            lesson_id,
            author_id,
            content
          )
          select
            target_lesson.tribe_id,
            target_lesson.id,
            (select user_id from viewer),
            ${command.content}
          from target_lesson
          where (select user_id from viewer) is not null
            and public.has_active_tribe_membership(target_lesson.tribe_id)
          returning id, lesson_id, author_id, content, created_at
        )
        select
          case
            when exists (select 1 from inserted_comment) then ${COMMENT_MUTATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_lesson) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status,
          inserted_comment.id,
          inserted_comment.lesson_id,
          inserted_comment.author_id,
          comment_author.name as author_name,
          comment_author.image as author_image_url,
          inserted_comment.content,
          to_char(
            inserted_comment.created_at at time zone 'utc',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"'
          ) as created_at,
          true as can_delete
        from (select 1) result
        left join inserted_comment
          on true
        left join public."user" comment_author
          on comment_author.id = inserted_comment.author_id
      `);
      const row = (result.rows?.[0] ?? null) as CommentMutationRow | null;

      if (
        row?.status === COMMENT_MUTATION_STATUS.created &&
        row.id &&
        row.lesson_id &&
        row.author_id &&
        row.content !== undefined &&
        row.created_at
      ) {
        return {
          comment: mapComment({
            author_id: row.author_id,
            author_image_url: row.author_image_url ?? null,
            author_name: row.author_name ?? null,
            can_delete: true,
            content: row.content,
            created_at: row.created_at,
            id: row.id,
            lesson_id: row.lesson_id,
          }),
          status: COMMENT_MUTATION_STATUS.created,
        };
      }

      return {
        status:
          row?.status === COURSE_MUTATION_STATUS.notFound
            ? COURSE_MUTATION_STATUS.notFound
            : COURSE_MUTATION_STATUS.forbidden,
      };
    });
  }

  async deleteComment(
    command: DeleteLessonCommentRepositoryCommand
  ): Promise<LessonCommentDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        viewer as (
          select
            nullif(public.current_app_user_id(), '') as user_id,
            coalesce(public.can_manage_tribe_courses((select id from target_tribe)), false) as can_manage
        ),
        target_comment as (
          select course_lesson_comments.id, course_lesson_comments.tribe_id, course_lesson_comments.author_id
          from public.course_lesson_comments
          inner join target_tribe
            on target_tribe.id = course_lesson_comments.tribe_id
          where course_lesson_comments.id = ${command.commentId}
          limit 1
        ),
        deleted_comment as (
          delete from public.course_lesson_comments
          using target_comment
          where course_lesson_comments.id = target_comment.id
            and (
              (select can_manage from viewer)
              or (
                target_comment.author_id = (select user_id from viewer)
                and public.has_active_tribe_membership(target_comment.tribe_id)
              )
            )
          returning course_lesson_comments.id
        )
        select
          case
            when exists (select 1 from deleted_comment) then ${COMMENT_MUTATION_STATUS.deleted}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_comment) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status
      `);
      const row = (result.rows?.[0] ?? null) as { status: string | null } | null;

      if (
        row?.status === COMMENT_MUTATION_STATUS.deleted ||
        row?.status === COURSE_MUTATION_STATUS.notFound
      ) {
        return { status: row.status };
      }

      return { status: COURSE_MUTATION_STATUS.forbidden };
    });
  }
}
