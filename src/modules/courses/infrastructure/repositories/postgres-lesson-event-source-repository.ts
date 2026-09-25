import { sql } from "drizzle-orm";

import { LESSON_EVENT_SOURCE_STATUS } from "@/src/modules/courses/constants/courses";
import type {
  CreateLessonFromEventRecordingRepositoryCommand,
  LessonConversionTargetCourse,
  LessonConversionTargetsLookup,
  LessonEventSourceRepository,
  LessonFromEventRecording,
  LessonFromEventRecordingResult,
} from "@/src/modules/courses/domain/repositories/lesson-event-source-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type TargetsRow = {
  can_manage: boolean | null;
  courses: unknown;
};

type ConversionTargetRow = {
  can_manage: boolean | null;
  module_in_course: boolean | null;
  tribe_id: string | null;
};

type LockedTargetRow = {
  can_manage: boolean | null;
  module_id: string | null;
};

type LessonRow = {
  course_module_id: string;
  id: string;
  title: string;
};

/**
 * Advisory lock namespace of one (course, occurrence) conversion.
 */
const CONVERSION_LOCK_PREFIX = "course_lesson_event_source:";
const ADVISORY_LOCK_SEED = 0;

function mapTargetCourses(value: unknown): LessonConversionTargetCourse[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((course: unknown) => {
    if (!course || typeof course !== "object") {
      return [];
    }

    const { id, modules, title } = course as Record<string, unknown>;

    if (typeof id !== "string" || typeof title !== "string") {
      return [];
    }

    return [
      {
        id,
        modules: Array.isArray(modules)
          ? modules.flatMap((courseModule: unknown) => {
              const { id: moduleId, title: moduleTitle } = (courseModule ?? {}) as Record<
                string,
                unknown
              >;

              return typeof moduleId === "string" && typeof moduleTitle === "string"
                ? [{ id: moduleId, title: moduleTitle }]
                : [];
            })
          : [],
        title,
      },
    ];
  });
}

function mapLesson(courseId: string, row: LessonRow): LessonFromEventRecording {
  return {
    courseId,
    courseModuleId: row.course_module_id,
    id: row.id,
    title: row.title,
  };
}

/**
 * Postgres adapter of the lessons created from event recordings. Every
 * statement repeats `can_manage_tribe_courses` (the runtime role bypasses
 * RLS) and resolves courses and modules through the tribe slug, so a lesson
 * can never land in another tribe's course.
 */
export class PostgresLessonEventSourceRepository implements LessonEventSourceRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async canManageCourses({ tribeSlug }: { tribeSlug: string }): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select coalesce(public.can_manage_tribe_courses(tribes.id), false) as can_manage
        from public.tribes
        where tribes.slug = ${tribeSlug}
        limit 1
      `);

      return Boolean(
        ((result.rows?.[0] ?? null) as { can_manage: boolean | null } | null)?.can_manage
      );
    });
  }

  async listConversionTargets({
    tribeSlug,
  }: {
    tribeSlug: string;
  }): Promise<LessonConversionTargetsLookup> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          coalesce(public.can_manage_tribe_courses(target_tribe.id), false) as can_manage,
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', courses.id,
                  'title', courses.title,
                  'modules', coalesce(
                    (
                      select jsonb_agg(
                        jsonb_build_object('id', course_modules.id, 'title', course_modules.title)
                        order by course_modules.sort_order, course_modules.created_at
                      )
                      from public.course_modules
                      where course_modules.course_id = courses.id
                        and course_modules.tribe_id = target_tribe.id
                    ),
                    '[]'::jsonb
                  )
                )
                order by courses.sort_order, courses.created_at
              )
              from public.courses
              where courses.tribe_id = target_tribe.id
                and public.can_manage_tribe_courses(target_tribe.id)
            ),
            '[]'::jsonb
          ) as courses
        from target_tribe
      `);
      const row = (result.rows?.[0] ?? null) as TargetsRow | null;

      if (!row) {
        return { status: LESSON_EVENT_SOURCE_STATUS.notFound };
      }

      if (!row.can_manage) {
        return { status: LESSON_EVENT_SOURCE_STATUS.forbidden };
      }

      return {
        courses: mapTargetCourses(row.courses),
        status: LESSON_EVENT_SOURCE_STATUS.found,
      };
    });
  }

  /**
   * Idempotent conversion: an advisory lock per (course, occurrence) is taken
   * in its own statement, so the lookup that follows gets a snapshot that
   * already sees a lesson committed by a concurrent request. With the lock
   * held, an existing lesson of that occurrence anywhere in the course is
   * returned (`existing`) instead of inserting a duplicate. Before any other
   * lock the viewer's `tribe_members` row is share-locked, so a concurrent
   * demotion, block, or removal waits for this transaction to commit and the
   * `can_manage_tribe_courses` reads that follow (before the conversion lock
   * and after it) cannot be revoked before the `existing` or `created`
   * answer. After the conversion lock the permission is re-evaluated and the
   * module is re-resolved and share-locked, so a course or module deleted
   * meanwhile answers `not_found` instead of a foreign key failure. Lock
   * order is membership → conversion advisory lock → module, the same
   * membership-first order the events writes follow.
   */
  async createFromEventRecording(
    command: CreateLessonFromEventRecordingRepositoryCommand
  ): Promise<LessonFromEventRecordingResult> {
    return this.executeWithDatabase(async (database) => {
      // Holds the viewer's membership until commit: a demotion, block, or
      // removal committed while this statement waited is visible to the next
      // statement, and one issued later waits for this conversion. No row
      // (not a member) is fine: the permission read below answers forbidden.
      await database.execute(sql`
        select tribe_members.id
        from public.tribe_members
        inner join public.tribes
          on tribes.id = tribe_members.tribe_id
        where tribes.slug = ${command.tribeSlug}
          and tribe_members.user_id = public.current_app_user_id()
        for share of tribe_members
      `);

      const targetResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_course as (
          select courses.id
          from public.courses
          inner join target_tribe
            on target_tribe.id = courses.tribe_id
          where courses.id = ${command.courseId}
          limit 1
        )
        select
          target_tribe.id as tribe_id,
          coalesce(public.can_manage_tribe_courses(target_tribe.id), false) as can_manage,
          exists (
            select 1
            from public.course_modules
            inner join target_course
              on target_course.id = course_modules.course_id
            where course_modules.id = ${command.courseModuleId}
              and course_modules.tribe_id = target_tribe.id
          ) as module_in_course
        from target_tribe
      `);
      const target = (targetResult.rows?.[0] ?? null) as ConversionTargetRow | null;

      if (!target?.tribe_id) {
        return { status: LESSON_EVENT_SOURCE_STATUS.notFound };
      }

      if (!target.can_manage) {
        return { status: LESSON_EVENT_SOURCE_STATUS.forbidden };
      }

      if (!target.module_in_course) {
        return { status: LESSON_EVENT_SOURCE_STATUS.notFound };
      }

      await database.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(
            ${CONVERSION_LOCK_PREFIX}::text || ${command.courseId}::text || ':'
              || ${command.sourceEventId}::text || '@'
              || extract(epoch from ${command.sourceOccurrenceStartsAt}::timestamptz)::text,
            ${ADVISORY_LOCK_SEED}
          )
        )
      `);

      // The course or module may have been deleted while this request waited
      // on the conversion lock. This read runs in a fresh snapshot: it
      // re-evaluates `can_manage_tribe_courses` (the membership row is already
      // share-locked, so the answer holds until commit) and share-locks the
      // module so a concurrent delete waits for this insert instead of
      // failing its foreign key. The course row is never locked, so the
      // course's cascading delete cannot deadlock with it.
      const lockedTargetResult = await database.execute(sql`
        with locked_module as (
          select course_modules.id
          from public.course_modules
          inner join public.courses
            on courses.id = course_modules.course_id
          where course_modules.id = ${command.courseModuleId}
            and course_modules.course_id = ${command.courseId}
            and course_modules.tribe_id = ${target.tribe_id}::uuid
            and courses.tribe_id = ${target.tribe_id}::uuid
          for share of course_modules
        )
        select
          coalesce(public.can_manage_tribe_courses(${target.tribe_id}::uuid), false) as can_manage,
          (select locked_module.id from locked_module) as module_id
      `);
      const lockedTarget = (lockedTargetResult.rows?.[0] ?? null) as LockedTargetRow | null;

      if (!lockedTarget?.can_manage) {
        return { status: LESSON_EVENT_SOURCE_STATUS.forbidden };
      }

      if (!lockedTarget.module_id) {
        return { status: LESSON_EVENT_SOURCE_STATUS.notFound };
      }

      const existingResult = await database.execute(sql`
        select course_lessons.id, course_lessons.title, course_lessons.course_module_id
        from public.course_lessons
        inner join public.course_modules
          on course_modules.id = course_lessons.course_module_id
        where course_modules.course_id = ${command.courseId}
          and course_lessons.tribe_id = ${target.tribe_id}::uuid
          and course_lessons.source_event_id = ${command.sourceEventId}
          and course_lessons.source_occurrence_starts_at = ${command.sourceOccurrenceStartsAt}::timestamptz
        order by course_lessons.created_at asc
        limit 1
      `);
      const existingLesson = (existingResult.rows?.[0] ?? null) as LessonRow | null;

      if (existingLesson) {
        return {
          lesson: mapLesson(command.courseId, existingLesson),
          status: LESSON_EVENT_SOURCE_STATUS.existing,
        };
      }

      const insertedResult = await database.execute(sql`
        insert into public.course_lessons (
          course_module_id,
          tribe_id,
          title,
          video_provider,
          external_video_id,
          description,
          sort_order,
          is_active,
          source_event_id,
          source_occurrence_starts_at,
          created_at,
          updated_at
        )
        select
          ${command.courseModuleId},
          ${target.tribe_id},
          ${command.title},
          ${command.videoProvider},
          ${command.externalVideoId},
          ${command.description},
          coalesce(
            (
              select max(module_lessons.sort_order) + 1
              from public.course_lessons module_lessons
              where module_lessons.course_module_id = ${command.courseModuleId}
            ),
            0
          ),
          true,
          ${command.sourceEventId},
          ${command.sourceOccurrenceStartsAt}::timestamptz,
          timezone('utc', now()),
          timezone('utc', now())
        where public.can_manage_tribe_courses(${target.tribe_id}::uuid)
        returning course_lessons.id, course_lessons.title, course_lessons.course_module_id
      `);
      const insertedLesson = (insertedResult.rows?.[0] ?? null) as LessonRow | null;

      return insertedLesson
        ? {
            lesson: mapLesson(command.courseId, insertedLesson),
            status: LESSON_EVENT_SOURCE_STATUS.created,
          }
        : { status: LESSON_EVENT_SOURCE_STATUS.forbidden };
    });
  }
}
