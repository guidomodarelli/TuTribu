import { sql } from "drizzle-orm";

import type {
  CourseCreationResult,
  CourseDeletionResult,
  CourseModuleCreationResult,
  CourseModuleDeletionResult,
  CourseModuleResult,
  CourseModuleUpdateResult,
  CourseModuleWithLessonsResult,
  CourseResult,
  CourseTreeResult,
  CourseUpdateResult,
  CourseWithModulesResult,
  LastViewedLessonRecordingResult,
  LessonCompletionResult,
  LessonCreationResult,
  LessonDeletionResult,
  LessonResult,
  LessonUpdateResult,
} from "@/src/modules/courses/application/results/course-results";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import type {
  CourseRepository,
  CreateCourseModuleRepositoryCommand,
  CreateCourseRepositoryCommand,
  CreateLessonRepositoryCommand,
  DeleteCourseModuleRepositoryCommand,
  DeleteCourseRepositoryCommand,
  DeleteLessonRepositoryCommand,
  GetTribeCoursesQuery,
  RecordLastViewedLessonRepositoryCommand,
  SetLessonCompletionRepositoryCommand,
  UpdateCourseModuleRepositoryCommand,
  UpdateCourseRepositoryCommand,
  UpdateLessonRepositoryCommand,
} from "@/src/modules/courses/domain/repositories/course-repository";
import type { LessonFileAttachmentDraft } from "@/src/modules/courses/domain/repositories/lesson-file-repository";
import type { LessonFile } from "@/src/modules/courses/domain/entities/lesson-file";
import {
  COURSE_ACCESS_REQUIREMENT,
  COURSE_ENGAGEMENT_STATUS,
  COURSE_VIEWER_ACCESS_STATUS,
  LESSON_FILE_STATUS,
} from "@/src/modules/courses/constants/courses";
import { normalizeCourseAccessRequirement } from "@/src/modules/courses/domain/value-objects/course-access-requirement";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

const COURSE_MUTATION_STATUS = {
  created: "created",
  deleted: "deleted",
  forbidden: "forbidden",
  invalidFile: "invalid_file",
  notFound: "not_found",
  updated: "updated",
} as const;

/**
 * Signals a lesson file attachment conflict that must abort the mutation.
 */
class LessonFileAttachmentConflictError extends Error {
  constructor() {
    super("Lesson file attachment conflict");
    this.name = "LessonFileAttachmentConflictError";
  }
}

type CourseRow = {
  access_requirement: string | null;
  cover_image_url: string | null;
  description: string | null;
  id: string;
  is_active: boolean;
  sort_order: number;
  title: string;
};

type CourseModuleRow = {
  course_id: string;
  id: string;
  is_active: boolean;
  sort_order: number;
  title: string;
  unlock_after_days: number | null;
};

type LessonRow = {
  course_module_id: string;
  description: string | null;
  external_video_id: string;
  id: string;
  is_active: boolean;
  sort_order: number;
  title: string;
  video_provider: string;
};

type LessonFileRow = {
  file_name: string | null;
  file_size_bytes: number | string | null;
  id: string;
  mime_type: string | null;
  sort_order: number | string | null;
};

type AttachedLessonFilesRow = {
  lesson_files: LessonFileRow[] | null;
};

/**
 * Maps persisted attached lesson file rows into the ordered material list of
 * the lesson view model.
 *
 * @param fileRows - Attached lesson file rows (with their `sort_order`).
 * @returns Lesson files sorted ascending by `sortOrder`.
 */
function mapLessonFiles(
  fileRows: LessonFileRow[] | null | undefined
): LessonFile[] {
  return (fileRows ?? [])
    .flatMap((row) => {
      if (!row.file_name) {
        return [];
      }

      return [
        {
          fileName: row.file_name,
          fileSizeBytes: Number(row.file_size_bytes ?? 0),
          id: row.id,
          mimeType: row.mime_type ?? "",
          sortOrder: Number(row.sort_order ?? 0),
        },
      ];
    })
    .sort((first, second) => first.sortOrder - second.sortOrder);
}

type CourseMutationRow = CourseRow & {
  status: string | null;
};

type CourseModuleMutationRow = CourseModuleRow & {
  status: string | null;
};

type LessonMutationRow = LessonRow & {
  status: string | null;
};

type MutationStatusOnlyRow = {
  status: string | null;
};

type CourseTreeRow = {
  can_manage_courses: boolean | null;
  course_access_requirement: string | null;
  course_completed_lesson_count: number | string | null;
  course_content_accessible: boolean | null;
  course_cover_image_url: string | null;
  course_description: string | null;
  course_id: string | null;
  course_is_active: boolean | null;
  course_last_viewed_lesson_id: string | null;
  course_sort_order: number | null;
  course_title: string | null;
  lesson_completed: boolean | null;
  lesson_course_module_id: string | null;
  lesson_description: string | null;
  lesson_external_video_id: string | null;
  lesson_files: LessonFileRow[] | null;
  lesson_id: string | null;
  lesson_is_active: boolean | null;
  lesson_sort_order: number | null;
  lesson_title: string | null;
  lesson_video_provider: string | null;
  module_course_id: string | null;
  module_id: string | null;
  module_is_active: boolean | null;
  module_is_locked: boolean | null;
  module_sort_order: number | null;
  module_title: string | null;
  module_unlock_after_days: number | null;
  module_unlocks_at: string | null;
};

function mapCourse(row: CourseRow): CourseResult {
  return {
    accessRequirement: normalizeCourseAccessRequirement(row.access_requirement),
    coverImageUrl: row.cover_image_url,
    description: row.description,
    id: row.id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    title: row.title,
  };
}

function mapCourseModule(row: CourseModuleRow): CourseModuleResult {
  return {
    courseId: row.course_id,
    id: row.id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    title: row.title,
    unlockAfterDays: row.unlock_after_days,
  };
}

function mapLesson(row: LessonRow, files?: LessonFile[]): LessonResult {
  return {
    courseModuleId: row.course_module_id,
    description: row.description,
    externalVideoId: row.external_video_id,
    ...(files !== undefined ? { files } : {}),
    id: row.id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    title: row.title,
    videoProvider: row.video_provider as VideoProvider,
  };
}

function mapCourseCreationResult(
  row: CourseMutationRow | null
): CourseCreationResult {
  if (row?.status === COURSE_MUTATION_STATUS.created) {
    return {
      course: mapCourse(row),
      status: COURSE_MUTATION_STATUS.created,
    };
  }

  return {
    status:
      row?.status === COURSE_MUTATION_STATUS.notFound
        ? COURSE_MUTATION_STATUS.notFound
        : COURSE_MUTATION_STATUS.forbidden,
  };
}

function mapCourseUpdateResult(
  row: CourseMutationRow | null
): CourseUpdateResult {
  if (row?.status === COURSE_MUTATION_STATUS.updated) {
    return {
      course: mapCourse(row),
      status: COURSE_MUTATION_STATUS.updated,
    };
  }

  return {
    status:
      row?.status === COURSE_MUTATION_STATUS.notFound
        ? COURSE_MUTATION_STATUS.notFound
        : COURSE_MUTATION_STATUS.forbidden,
  };
}

function mapCourseDeletionResult(
  row: MutationStatusOnlyRow | null
): CourseDeletionResult {
  if (
    row?.status === COURSE_MUTATION_STATUS.deleted ||
    row?.status === COURSE_MUTATION_STATUS.notFound
  ) {
    return { status: row.status };
  }

  return { status: COURSE_MUTATION_STATUS.forbidden };
}

function mapModuleCreationResult(
  row: CourseModuleMutationRow | null
): CourseModuleCreationResult {
  if (row?.status === COURSE_MUTATION_STATUS.created) {
    return {
      courseModule: mapCourseModule(row),
      status: COURSE_MUTATION_STATUS.created,
    };
  }

  return {
    status:
      row?.status === COURSE_MUTATION_STATUS.notFound
        ? COURSE_MUTATION_STATUS.notFound
        : COURSE_MUTATION_STATUS.forbidden,
  };
}

function mapModuleUpdateResult(
  row: CourseModuleMutationRow | null
): CourseModuleUpdateResult {
  if (row?.status === COURSE_MUTATION_STATUS.updated) {
    return {
      courseModule: mapCourseModule(row),
      status: COURSE_MUTATION_STATUS.updated,
    };
  }

  return {
    status:
      row?.status === COURSE_MUTATION_STATUS.notFound
        ? COURSE_MUTATION_STATUS.notFound
        : COURSE_MUTATION_STATUS.forbidden,
  };
}

function mapModuleDeletionResult(
  row: MutationStatusOnlyRow | null
): CourseModuleDeletionResult {
  if (
    row?.status === COURSE_MUTATION_STATUS.deleted ||
    row?.status === COURSE_MUTATION_STATUS.notFound
  ) {
    return { status: row.status };
  }

  return { status: COURSE_MUTATION_STATUS.forbidden };
}

function mapLessonCreationResult(
  row: LessonMutationRow | null,
  files: LessonFile[] = []
): LessonCreationResult {
  if (row?.status === COURSE_MUTATION_STATUS.created) {
    return {
      lesson: mapLesson(row, files),
      status: COURSE_MUTATION_STATUS.created,
    };
  }

  return {
    status:
      row?.status === COURSE_MUTATION_STATUS.notFound
        ? COURSE_MUTATION_STATUS.notFound
        : COURSE_MUTATION_STATUS.forbidden,
  };
}

function mapLessonUpdateResult(
  row: LessonMutationRow | null,
  files: LessonFile[] | undefined
): LessonUpdateResult {
  if (row?.status === COURSE_MUTATION_STATUS.updated) {
    return {
      lesson: mapLesson(row, files),
      status: COURSE_MUTATION_STATUS.updated,
    };
  }

  return {
    status:
      row?.status === COURSE_MUTATION_STATUS.notFound
        ? COURSE_MUTATION_STATUS.notFound
        : COURSE_MUTATION_STATUS.forbidden,
  };
}

function mapLessonDeletionResult(
  row: MutationStatusOnlyRow | null
): LessonDeletionResult {
  if (
    row?.status === COURSE_MUTATION_STATUS.deleted ||
    row?.status === COURSE_MUTATION_STATUS.notFound
  ) {
    return { status: row.status };
  }

  return { status: COURSE_MUTATION_STATUS.forbidden };
}

function buildCourseTree(rows: CourseTreeRow[]): CourseTreeResult {
  const courseMap = new Map<string, CourseWithModulesResult>();
  const courseOrder: string[] = [];
  const moduleMap = new Map<string, CourseModuleWithLessonsResult>();

  for (const row of rows) {
    if (!row.course_id) {
      continue;
    }

    let course = courseMap.get(row.course_id);
    if (!course) {
      course = {
        accessRequirement: normalizeCourseAccessRequirement(
          row.course_access_requirement
        ),
        coverImageUrl: row.course_cover_image_url,
        description: row.course_description,
        id: row.course_id,
        isActive: Boolean(row.course_is_active),
        lastViewedLessonId: row.course_last_viewed_lesson_id,
        modules: [],
        sortOrder: row.course_sort_order ?? 0,
        title: row.course_title ?? "",
        viewerAccess: {
          completedLessonCount: Number(row.course_completed_lesson_count ?? 0),
          status:
            row.course_content_accessible === false
              ? COURSE_VIEWER_ACCESS_STATUS.academyRequired
              : COURSE_VIEWER_ACCESS_STATUS.available,
        },
      };
      courseMap.set(row.course_id, course);
      courseOrder.push(row.course_id);
    }

    if (!row.module_id) {
      continue;
    }

    let courseModule = moduleMap.get(row.module_id);
    if (!courseModule) {
      courseModule = {
        courseId: row.module_course_id ?? row.course_id,
        id: row.module_id,
        isActive: Boolean(row.module_is_active),
        lessons: [],
        sortOrder: row.module_sort_order ?? 0,
        title: row.module_title ?? "",
        unlockAfterDays: row.module_unlock_after_days,
        viewerAccess: {
          isLocked: Boolean(row.module_is_locked),
          unlocksAt: row.module_unlocks_at,
        },
      };
      moduleMap.set(row.module_id, courseModule);
      course.modules.push(courseModule);
    }

    if (row.lesson_id) {
      courseModule.lessons.push({
        completed: Boolean(row.lesson_completed),
        courseModuleId: row.lesson_course_module_id ?? row.module_id,
        description: row.lesson_description,
        externalVideoId: row.lesson_external_video_id ?? "",
        files: mapLessonFiles(row.lesson_files),
        id: row.lesson_id,
        isActive: Boolean(row.lesson_is_active),
        sortOrder: row.lesson_sort_order ?? 0,
        title: row.lesson_title ?? "",
        videoProvider: (row.lesson_video_provider ?? "") as VideoProvider,
      });
    }
  }

  return {
    courses: courseOrder.map((courseId) => courseMap.get(courseId)!),
    viewerPermissions: {
      canManageCourses: Boolean(rows[0]?.can_manage_courses),
    },
  };
}

export class PostgresCourseRepository implements CourseRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async getTreeByTribeSlug(query: GetTribeCoursesQuery): Promise<CourseTreeResult> {
    return this.readCourseTree({ includeInactive: false, tribeSlug: query.tribeSlug });
  }

  async getEditableTreeByTribeSlug(
    query: GetTribeCoursesQuery
  ): Promise<CourseTreeResult> {
    return this.readCourseTree({ includeInactive: true, tribeSlug: query.tribeSlug });
  }

  async createCourse(command: CreateCourseRepositoryCommand): Promise<CourseCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        inserted_course as (
          insert into public.courses (
            tribe_id,
            title,
            description,
            cover_image_url,
            sort_order,
            is_active,
            access_requirement,
            created_at,
            updated_at
          )
          select
            target_tribe.id,
            ${command.title},
            ${command.description},
            ${command.coverImageUrl},
            ${command.sortOrder},
            true,
            ${command.accessRequirement},
            timezone('utc', now()),
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_courses(target_tribe.id)
          returning id, title, description, cover_image_url, sort_order, is_active, access_requirement
        )
        select
          case
            when exists (select 1 from inserted_course) then ${COURSE_MUTATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status,
          inserted_course.id,
          inserted_course.title,
          inserted_course.description,
          inserted_course.cover_image_url,
          inserted_course.sort_order,
          inserted_course.is_active,
          inserted_course.access_requirement
        from (select 1) result
        left join inserted_course
          on true
      `);

      return mapCourseCreationResult(
        (result.rows?.[0] ?? null) as CourseMutationRow | null
      );
    });
  }

  async updateCourse(command: UpdateCourseRepositoryCommand): Promise<CourseUpdateResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
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
        ),
        updated_course as (
          update public.courses
          set
            title = ${command.title},
            description = ${command.description},
            cover_image_url = ${command.coverImageUrl},
            sort_order = ${command.sortOrder},
            is_active = ${command.isActive},
            access_requirement = coalesce(${command.accessRequirement}, courses.access_requirement),
            updated_at = timezone('utc', now())
          from target_tribe
          where courses.id = ${command.courseId}
            and courses.tribe_id = target_tribe.id
            and public.can_manage_tribe_courses(target_tribe.id)
          returning courses.id, courses.title, courses.description, courses.cover_image_url, courses.sort_order, courses.is_active, courses.access_requirement
        )
        select
          case
            when exists (select 1 from updated_course) then ${COURSE_MUTATION_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_course) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status,
          updated_course.id,
          updated_course.title,
          updated_course.description,
          updated_course.cover_image_url,
          updated_course.sort_order,
          updated_course.is_active,
          updated_course.access_requirement
        from (select 1) result
        left join updated_course
          on true
      `);

      return mapCourseUpdateResult(
        (result.rows?.[0] ?? null) as CourseMutationRow | null
      );
    });
  }

  async deleteCourse(command: DeleteCourseRepositoryCommand): Promise<CourseDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
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
        ),
        deleted_course as (
          delete from public.courses
          where courses.id = ${command.courseId}
            and courses.tribe_id = (select id from target_tribe)
            and public.can_manage_tribe_courses(courses.tribe_id)
          returning courses.id
        )
        select
          case
            when exists (select 1 from deleted_course) then ${COURSE_MUTATION_STATUS.deleted}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_course) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status
      `);

      return mapCourseDeletionResult(
        (result.rows?.[0] ?? null) as MutationStatusOnlyRow | null
      );
    });
  }

  async createCourseModule(
    command: CreateCourseModuleRepositoryCommand
  ): Promise<CourseModuleCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_course as (
          select courses.id, courses.tribe_id
          from public.courses
          inner join target_tribe
            on target_tribe.id = courses.tribe_id
          where courses.id = ${command.courseId}
          limit 1
        ),
        inserted_module as (
          insert into public.course_modules (
            tribe_id,
            course_id,
            title,
            sort_order,
            unlock_after_days,
            is_active,
            created_at,
            updated_at
          )
          select
            target_course.tribe_id,
            target_course.id,
            ${command.title},
            ${command.sortOrder},
            ${command.unlockAfterDays},
            true,
            timezone('utc', now()),
            timezone('utc', now())
          from target_course
          where public.can_manage_tribe_courses(target_course.tribe_id)
          returning id, course_id, title, sort_order, unlock_after_days, is_active
        )
        select
          case
            when exists (select 1 from inserted_module) then ${COURSE_MUTATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_course) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status,
          inserted_module.id,
          inserted_module.course_id,
          inserted_module.title,
          inserted_module.sort_order,
          inserted_module.unlock_after_days,
          inserted_module.is_active
        from (select 1) result
        left join inserted_module
          on true
      `);

      return mapModuleCreationResult(
        (result.rows?.[0] ?? null) as CourseModuleMutationRow | null
      );
    });
  }

  async updateCourseModule(
    command: UpdateCourseModuleRepositoryCommand
  ): Promise<CourseModuleUpdateResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_module as (
          select course_modules.id
          from public.course_modules
          inner join target_tribe
            on target_tribe.id = course_modules.tribe_id
          where course_modules.id = ${command.courseModuleId}
          limit 1
        ),
        updated_module as (
          update public.course_modules
          set
            title = ${command.title},
            sort_order = ${command.sortOrder},
            unlock_after_days = ${command.unlockAfterDays},
            is_active = ${command.isActive},
            updated_at = timezone('utc', now())
          from target_tribe
          where course_modules.id = ${command.courseModuleId}
            and course_modules.tribe_id = target_tribe.id
            and public.can_manage_tribe_courses(target_tribe.id)
          returning course_modules.id, course_modules.course_id, course_modules.title, course_modules.sort_order, course_modules.unlock_after_days, course_modules.is_active
        )
        select
          case
            when exists (select 1 from updated_module) then ${COURSE_MUTATION_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_module) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status,
          updated_module.id,
          updated_module.course_id,
          updated_module.title,
          updated_module.sort_order,
          updated_module.unlock_after_days,
          updated_module.is_active
        from (select 1) result
        left join updated_module
          on true
      `);

      return mapModuleUpdateResult(
        (result.rows?.[0] ?? null) as CourseModuleMutationRow | null
      );
    });
  }

  async deleteCourseModule(
    command: DeleteCourseModuleRepositoryCommand
  ): Promise<CourseModuleDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_module as (
          select course_modules.id
          from public.course_modules
          inner join target_tribe
            on target_tribe.id = course_modules.tribe_id
          where course_modules.id = ${command.courseModuleId}
          limit 1
        ),
        deleted_module as (
          delete from public.course_modules
          where course_modules.id = ${command.courseModuleId}
            and course_modules.tribe_id = (select id from target_tribe)
            and public.can_manage_tribe_courses(course_modules.tribe_id)
          returning course_modules.id
        )
        select
          case
            when exists (select 1 from deleted_module) then ${COURSE_MUTATION_STATUS.deleted}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_module) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status
      `);

      return mapModuleDeletionResult(
        (result.rows?.[0] ?? null) as MutationStatusOnlyRow | null
      );
    });
  }

  async createLesson(
    command: CreateLessonRepositoryCommand
  ): Promise<LessonCreationResult> {
    try {
      return await this.executeWithDatabase(async (database) => {
        const result = await database.execute(sql`
          with target_tribe as (
            select tribes.id
            from public.tribes
            where tribes.slug = ${command.tribeSlug}
            limit 1
          ),
          target_module as (
            select course_modules.id
            from public.course_modules
            inner join target_tribe
              on target_tribe.id = course_modules.tribe_id
            where course_modules.id = ${command.courseModuleId}
            limit 1
          ),
          inserted_lesson as (
            insert into public.course_lessons (
              course_module_id,
              tribe_id,
              title,
              video_provider,
              external_video_id,
              description,
              sort_order,
              is_active,
              created_at,
              updated_at
            )
            select
              target_module.id,
              target_tribe.id,
              ${command.title},
              ${command.videoProvider},
              ${command.externalVideoId},
              ${command.description},
              ${command.sortOrder},
              true,
              timezone('utc', now()),
              timezone('utc', now())
            from target_module, target_tribe
            where public.can_manage_tribe_courses(target_tribe.id)
            returning id, tribe_id, course_module_id, title, video_provider, external_video_id, description, sort_order, is_active
          )
          select
            case
              when exists (select 1 from inserted_lesson) then ${COURSE_MUTATION_STATUS.created}
              when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
              when not exists (select 1 from target_module) then ${COURSE_MUTATION_STATUS.notFound}
              else ${COURSE_MUTATION_STATUS.forbidden}
            end as status,
            inserted_lesson.id,
            inserted_lesson.tribe_id,
            inserted_lesson.course_module_id,
            inserted_lesson.title,
            inserted_lesson.video_provider,
            inserted_lesson.external_video_id,
            inserted_lesson.description,
            inserted_lesson.sort_order,
            inserted_lesson.is_active
          from (select 1) result
          left join inserted_lesson
            on true
        `);
        const lessonRow = (result.rows?.[0] ?? null) as
          | (LessonMutationRow & { tribe_id: string | null })
          | null;
        let attachedFiles: LessonFile[] = [];

        if (
          lessonRow?.status === COURSE_MUTATION_STATUS.created &&
          lessonRow.id &&
          lessonRow.tribe_id &&
          command.files?.length
        ) {
          attachedFiles = await this.replaceLessonFiles(database, {
            files: command.files,
            lessonId: lessonRow.id,
            tribeId: lessonRow.tribe_id,
          });
        }

        return mapLessonCreationResult(lessonRow, attachedFiles);
      });
    } catch (error) {
      if (error instanceof LessonFileAttachmentConflictError) {
        return { status: COURSE_MUTATION_STATUS.invalidFile };
      }

      throw error;
    }
  }

  async updateLesson(
    command: UpdateLessonRepositoryCommand
  ): Promise<LessonUpdateResult> {
    try {
      return await this.executeWithDatabase(async (database) => {
        const result = await database.execute(sql`
          with target_tribe as (
            select tribes.id
            from public.tribes
            where tribes.slug = ${command.tribeSlug}
            limit 1
          ),
          target_module as (
            select course_modules.id
            from public.course_modules
            inner join target_tribe
              on target_tribe.id = course_modules.tribe_id
            where course_modules.id = ${command.courseModuleId}
            limit 1
          ),
          target_lesson as (
            select course_lessons.id
            from public.course_lessons
            inner join target_tribe
              on target_tribe.id = course_lessons.tribe_id
            where course_lessons.id = ${command.lessonId}
            limit 1
          ),
          updated_lesson as (
            update public.course_lessons
            set
              course_module_id = ${command.courseModuleId},
              title = ${command.title},
              video_provider = ${command.videoProvider},
              external_video_id = ${command.externalVideoId},
              description = ${command.description},
              sort_order = ${command.sortOrder},
              is_active = ${command.isActive},
              updated_at = timezone('utc', now())
            from target_tribe, target_module
            where course_lessons.id = ${command.lessonId}
              and course_lessons.tribe_id = target_tribe.id
              and target_module.id = ${command.courseModuleId}
              and public.can_manage_tribe_courses(target_tribe.id)
            returning course_lessons.id, course_lessons.tribe_id, course_lessons.course_module_id, course_lessons.title, course_lessons.video_provider, course_lessons.external_video_id, course_lessons.description, course_lessons.sort_order, course_lessons.is_active
          )
          select
            case
              when exists (select 1 from updated_lesson) then ${COURSE_MUTATION_STATUS.updated}
              when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
              when not exists (select 1 from target_module) then ${COURSE_MUTATION_STATUS.notFound}
              when not exists (select 1 from target_lesson) then ${COURSE_MUTATION_STATUS.notFound}
              else ${COURSE_MUTATION_STATUS.forbidden}
            end as status,
            updated_lesson.id,
            updated_lesson.tribe_id,
            updated_lesson.course_module_id,
            updated_lesson.title,
            updated_lesson.video_provider,
            updated_lesson.external_video_id,
            updated_lesson.description,
            updated_lesson.sort_order,
            updated_lesson.is_active
          from (select 1) result
          left join updated_lesson
            on true
        `);
        const lessonRow = (result.rows?.[0] ?? null) as
          | (LessonMutationRow & { tribe_id: string | null })
          | null;
        let attachedFiles: LessonFile[] | undefined = undefined;

        if (
          lessonRow?.status === COURSE_MUTATION_STATUS.updated &&
          lessonRow.id &&
          lessonRow.tribe_id &&
          command.files !== undefined
        ) {
          attachedFiles = await this.replaceLessonFiles(database, {
            files: command.files,
            lessonId: lessonRow.id,
            tribeId: lessonRow.tribe_id,
          });
        }

        return mapLessonUpdateResult(lessonRow, attachedFiles);
      });
    } catch (error) {
      if (error instanceof LessonFileAttachmentConflictError) {
        return { status: COURSE_MUTATION_STATUS.invalidFile };
      }

      throw error;
    }
  }

  /**
   * Replaces the attached file set of a lesson inside the current database
   * context: previously attached files are detached into `pending_delete`
   * (their R2 objects are removed by the caller or the scheduled sweep) and
   * the provided drafts are attached with the leader-chosen order. Throws a
   * conflict error when any draft cannot be attached, so the caller maps it to
   * an invalid-file status.
   */
  private async replaceLessonFiles(
    database: RequestDatabase,
    command: {
      files: LessonFileAttachmentDraft[];
      lessonId: string;
      tribeId: string;
    }
  ): Promise<LessonFile[]> {
    // Detach the whole attached set first (sort_order goes null), mirroring
    // the message attachment flow: re-attaching below restores the surviving
    // files without transient unique-index conflicts when slots are swapped.
    await database.execute(sql`
      update public.course_lesson_files
      set status = ${LESSON_FILE_STATUS.pendingDelete},
          sort_order = null,
          updated_at = timezone('utc', now())
      where course_lesson_files.lesson_id = ${command.lessonId}
        and course_lesson_files.tribe_id = ${command.tribeId}
        and course_lesson_files.status = ${LESSON_FILE_STATUS.attached}
    `);

    if (command.files.length === 0) {
      return [];
    }

    const fileIds = command.files.map((file) => file.assetId);
    const sortOrders = command.files.map((file) => file.sortOrder);
    const attachedFilesResult = await database.execute(sql`
      with file_input as (
        select
          file_input.file_id,
          file_input.sort_order::integer as sort_order
        from unnest(
          ${sql.param(fileIds)}::uuid[],
          ${sql.param(sortOrders)}::int[]
        ) as file_input(file_id, sort_order)
      ),
      updated_files as (
        update public.course_lesson_files
        set lesson_id = ${command.lessonId},
            status = ${LESSON_FILE_STATUS.attached},
            sort_order = file_input.sort_order,
            updated_at = timezone('utc', now())
        from file_input
        where course_lesson_files.id = file_input.file_id
          and course_lesson_files.tribe_id = ${command.tribeId}
          and (
            course_lesson_files.status = ${LESSON_FILE_STATUS.draft}
            or (
              course_lesson_files.status = ${LESSON_FILE_STATUS.pendingDelete}
              and course_lesson_files.lesson_id = ${command.lessonId}
            )
          )
        returning
          course_lesson_files.id,
          course_lesson_files.file_name,
          course_lesson_files.file_size_bytes,
          course_lesson_files.mime_type,
          course_lesson_files.sort_order
      )
      select
        coalesce(
          json_agg(
            json_build_object(
              'file_name', updated_files.file_name,
              'file_size_bytes', updated_files.file_size_bytes,
              'id', updated_files.id,
              'mime_type', updated_files.mime_type,
              'sort_order', updated_files.sort_order
            )
            order by updated_files.sort_order
          ),
          '[]'::json
        ) as lesson_files
      from updated_files
    `);
    const attachedFiles =
      ((attachedFilesResult.rows?.[0] ?? null) as AttachedLessonFilesRow | null)
        ?.lesson_files ?? [];

    if (attachedFiles.length !== command.files.length) {
      throw new LessonFileAttachmentConflictError();
    }

    return mapLessonFiles(attachedFiles);
  }

  async deleteLesson(
    command: DeleteLessonRepositoryCommand
  ): Promise<LessonDeletionResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_lesson as (
          select course_lessons.id
          from public.course_lessons
          inner join target_tribe
            on target_tribe.id = course_lessons.tribe_id
          where course_lessons.id = ${command.lessonId}
          limit 1
        ),
        deleted_lesson as (
          delete from public.course_lessons
          where course_lessons.id = ${command.lessonId}
            and course_lessons.tribe_id = (select id from target_tribe)
            and public.can_manage_tribe_courses(course_lessons.tribe_id)
          returning course_lessons.id
        )
        select
          case
            when exists (select 1 from deleted_lesson) then ${COURSE_MUTATION_STATUS.deleted}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_lesson) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status
      `);

      return mapLessonDeletionResult(
        (result.rows?.[0] ?? null) as MutationStatusOnlyRow | null
      );
    });
  }

  async setLessonCompletion(
    command: SetLessonCompletionRepositoryCommand
  ): Promise<LessonCompletionResult> {
    return this.executeWithDatabase(async (database) => {
      const successStatus = command.completed
        ? COURSE_ENGAGEMENT_STATUS.completed
        : COURSE_ENGAGEMENT_STATUS.uncompleted;
      const mutation = command.completed
        ? sql`
            insert into public.course_lesson_completions (tribe_id, lesson_id, user_id)
            select target_lesson.tribe_id, target_lesson.id, (select user_id from viewer)
            from target_lesson
            where exists (select 1 from allowed_lesson)
            on conflict (lesson_id, user_id) do nothing
            returning id
          `
        : sql`
            delete from public.course_lesson_completions
            using target_lesson
            where course_lesson_completions.lesson_id = target_lesson.id
              and course_lesson_completions.user_id = (select user_id from viewer)
              and exists (select 1 from allowed_lesson)
            returning course_lesson_completions.id
          `;
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        viewer as (
          select nullif(public.current_app_user_id(), '') as user_id
        ),
        target_lesson as (
          select course_lessons.id, course_lessons.tribe_id, course_lessons.course_module_id
          from public.course_lessons
          inner join target_tribe
            on target_tribe.id = course_lessons.tribe_id
          where course_lessons.id = ${command.lessonId}
            and course_lessons.is_active = true
          limit 1
        ),
        allowed_lesson as (
          select target_lesson.id
          from target_lesson
          where (select user_id from viewer) is not null
            and public.can_read_tribe_courses(target_lesson.tribe_id)
            and public.is_course_module_unlocked(target_lesson.course_module_id)
        ),
        mutated as (
          ${mutation}
        )
        select
          case
            when exists (select 1 from allowed_lesson) then ${successStatus}
            when not exists (select 1 from target_lesson) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status,
          exists (select 1 from mutated) as mutated
      `);
      const row = (result.rows?.[0] ?? null) as MutationStatusOnlyRow | null;

      if (
        row?.status === COURSE_ENGAGEMENT_STATUS.completed ||
        row?.status === COURSE_ENGAGEMENT_STATUS.uncompleted ||
        row?.status === COURSE_MUTATION_STATUS.notFound
      ) {
        return { status: row.status };
      }

      return { status: COURSE_MUTATION_STATUS.forbidden };
    });
  }

  async recordLastViewedLesson(
    command: RecordLastViewedLessonRepositoryCommand
  ): Promise<LastViewedLessonRecordingResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        viewer as (
          select nullif(public.current_app_user_id(), '') as user_id
        ),
        target_course as (
          select courses.id, courses.tribe_id
          from public.courses
          inner join target_tribe
            on target_tribe.id = courses.tribe_id
          where courses.id = ${command.courseId}
          limit 1
        ),
        target_lesson as (
          select course_lessons.id, course_lessons.tribe_id, course_lessons.course_module_id
          from public.course_lessons
          inner join target_course
            on target_course.tribe_id = course_lessons.tribe_id
          inner join public.course_modules
            on course_modules.id = course_lessons.course_module_id
            and course_modules.course_id = target_course.id
          where course_lessons.id = ${command.lessonId}
          limit 1
        ),
        allowed_lesson as (
          select target_lesson.id
          from target_lesson
          where (select user_id from viewer) is not null
            and public.can_read_tribe_courses(target_lesson.tribe_id)
            and public.is_course_module_unlocked(target_lesson.course_module_id)
        ),
        upserted as (
          insert into public.course_last_viewed_lessons (tribe_id, course_id, lesson_id, user_id)
          select
            target_lesson.tribe_id,
            (select id from target_course),
            target_lesson.id,
            (select user_id from viewer)
          from target_lesson
          where exists (select 1 from allowed_lesson)
          on conflict (course_id, user_id) do update
            set lesson_id = excluded.lesson_id,
                viewed_at = timezone('utc', now())
          returning id
        )
        select
          case
            when exists (select 1 from upserted) then ${COURSE_ENGAGEMENT_STATUS.recorded}
            when not exists (select 1 from target_course) then ${COURSE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_lesson) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status
      `);
      const row = (result.rows?.[0] ?? null) as MutationStatusOnlyRow | null;

      if (
        row?.status === COURSE_ENGAGEMENT_STATUS.recorded ||
        row?.status === COURSE_MUTATION_STATUS.notFound
      ) {
        return { status: row.status };
      }

      return { status: COURSE_MUTATION_STATUS.forbidden };
    });
  }

  private async readCourseTree({
    includeInactive,
    tribeSlug,
  }: {
    includeInactive: boolean;
    tribeSlug: string;
  }): Promise<CourseTreeResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        ),
        viewer as (
          select nullif(public.current_app_user_id(), '') as user_id
        ),
        viewer_permissions as (
          select coalesce(public.can_manage_tribe_courses((select id from target_tribe)), false) as can_manage_courses
        ),
        membership as (
          select
            tribe_members.created_at as joined_at,
            member_product_enrollments.first_activated_at as academy_activated_at
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          left join public.member_product_enrollments
            on member_product_enrollments.tribe_id = tribe_members.tribe_id
            and member_product_enrollments.user_id = tribe_members.user_id
            and member_product_enrollments.product_key = ${COURSE_ACCESS_REQUIREMENT.academy}
          where tribe_members.user_id = (select user_id from viewer)
            and tribe_members.status in ('active', 'muted')
          limit 1
        ),
        course_rows as (
          -- The runtime role bypasses RLS: only readable memberships (or the
          -- course manager) see the catalog, and course content is resolved
          -- per course with can_read_course_content (academy requirement).
          select
            courses.id,
            courses.title,
            courses.description,
            courses.cover_image_url,
            courses.sort_order,
            courses.is_active,
            courses.access_requirement,
            courses.created_at,
            public.can_read_course_content(courses.id) as content_accessible,
            (
              courses.access_requirement = ${COURSE_ACCESS_REQUIREMENT.academy}
              and public.tribe_uses_academy_access(courses.tribe_id)
            ) as drips_from_academy_activation
          from public.courses
          inner join target_tribe
            on target_tribe.id = courses.tribe_id
          where (${includeInactive} or courses.is_active = true)
            and (
              public.can_read_tribe_courses(target_tribe.id)
              or (select can_manage_courses from viewer_permissions)
            )
        ),
        module_origin as (
          -- Drip origin: academy courses start at the first academy activation,
          -- basic courses at the membership creation. Modules of a course whose
          -- content the viewer cannot read are never selected.
          select
            course_modules.id,
            course_modules.course_id,
            course_modules.title,
            course_modules.sort_order,
            course_modules.unlock_after_days,
            course_modules.is_active,
            course_modules.created_at,
            case
              when course_rows.drips_from_academy_activation
                then (select academy_activated_at from membership)
              else (select joined_at from membership)
            end as drip_origin
          from public.course_modules
          inner join course_rows
            on course_rows.id = course_modules.course_id
            and course_rows.content_accessible = true
          where ${includeInactive} or course_modules.is_active = true
        ),
        module_rows as (
          select
            module_origin.id,
            module_origin.course_id,
            module_origin.title,
            module_origin.sort_order,
            module_origin.unlock_after_days,
            module_origin.is_active,
            module_origin.created_at,
            case
              when (select can_manage_courses from viewer_permissions) then false
              when module_origin.unlock_after_days is null then false
              when module_origin.drip_origin is null then true
              when module_origin.drip_origin
                + make_interval(days => module_origin.unlock_after_days)
                <= timezone('utc', now()) then false
              else true
            end as is_locked,
            case
              when module_origin.unlock_after_days is null then null
              when module_origin.drip_origin is null then null
              else to_char(
                (module_origin.drip_origin
                  + make_interval(days => module_origin.unlock_after_days)) at time zone 'utc',
                'YYYY-MM-DD"T"HH24:MI:SS"Z"'
              )
            end as unlocks_at
          from module_origin
        ),
        lesson_rows as (
          select
            course_lessons.id,
            course_lessons.course_module_id,
            course_lessons.title,
            course_lessons.video_provider,
            course_lessons.external_video_id,
            course_lessons.description,
            course_lessons.sort_order,
            course_lessons.is_active,
            course_lessons.created_at
          from public.course_lessons
          inner join target_tribe
            on target_tribe.id = course_lessons.tribe_id
          where ${includeInactive} or course_lessons.is_active = true
        ),
        viewer_completions as (
          select course_lesson_completions.lesson_id
          from public.course_lesson_completions
          inner join target_tribe
            on target_tribe.id = course_lesson_completions.tribe_id
          where course_lesson_completions.user_id = (select user_id from viewer)
        ),
        viewer_last_viewed as (
          select
            course_last_viewed_lessons.course_id,
            course_last_viewed_lessons.lesson_id
          from public.course_last_viewed_lessons
          inner join course_rows
            on course_rows.id = course_last_viewed_lessons.course_id
            and course_rows.content_accessible = true
          where course_last_viewed_lessons.user_id = (select user_id from viewer)
        ),
        viewer_course_progress as (
          -- Own progress summary stays readable after access ends (only a
          -- count, never lesson content).
          select
            course_modules.course_id,
            count(*)::int as completed_lesson_count
          from public.course_lesson_completions
          inner join public.course_lessons
            on course_lessons.id = course_lesson_completions.lesson_id
          inner join public.course_modules
            on course_modules.id = course_lessons.course_module_id
          inner join target_tribe
            on target_tribe.id = course_lesson_completions.tribe_id
          where course_lesson_completions.user_id = (select user_id from viewer)
          group by course_modules.course_id
        )
        select
          viewer_permissions.can_manage_courses,
          course_rows.id                 as course_id,
          course_rows.title              as course_title,
          course_rows.description        as course_description,
          course_rows.cover_image_url    as course_cover_image_url,
          course_rows.sort_order         as course_sort_order,
          course_rows.is_active          as course_is_active,
          course_rows.access_requirement as course_access_requirement,
          course_rows.content_accessible as course_content_accessible,
          coalesce(viewer_course_progress.completed_lesson_count, 0) as course_completed_lesson_count,
          viewer_last_viewed.lesson_id   as course_last_viewed_lesson_id,
          module_rows.id                 as module_id,
          module_rows.course_id          as module_course_id,
          module_rows.title              as module_title,
          module_rows.sort_order         as module_sort_order,
          module_rows.unlock_after_days  as module_unlock_after_days,
          module_rows.is_active          as module_is_active,
          module_rows.is_locked          as module_is_locked,
          module_rows.unlocks_at         as module_unlocks_at,
          lesson_rows.id                  as lesson_id,
          lesson_rows.course_module_id    as lesson_course_module_id,
          lesson_rows.title               as lesson_title,
          lesson_rows.video_provider      as lesson_video_provider,
          lesson_rows.external_video_id   as lesson_external_video_id,
          lesson_rows.description         as lesson_description,
          lesson_rows.sort_order          as lesson_sort_order,
          lesson_rows.is_active           as lesson_is_active,
          (viewer_completions.lesson_id is not null) as lesson_completed,
          coalesce(lesson_files.lesson_files, '[]'::jsonb) as lesson_files
        from viewer_permissions
        left join course_rows
          on true
        left join viewer_last_viewed
          on viewer_last_viewed.course_id = course_rows.id
        left join viewer_course_progress
          on viewer_course_progress.course_id = course_rows.id
        left join module_rows
          on module_rows.course_id = course_rows.id
        left join lesson_rows
          on lesson_rows.course_module_id = module_rows.id
          and (module_rows.is_locked = false or ${includeInactive})
        left join viewer_completions
          on viewer_completions.lesson_id = lesson_rows.id
        left join lateral (
          select jsonb_agg(
            jsonb_build_object(
              'file_name', file_assets.file_name,
              'file_size_bytes', file_assets.file_size_bytes,
              'id', file_assets.id,
              'mime_type', file_assets.mime_type,
              'sort_order', file_assets.sort_order
            )
            order by file_assets.sort_order asc, file_assets.created_at asc
          ) as lesson_files
          from public.course_lesson_files file_assets
          where file_assets.lesson_id = lesson_rows.id
            and file_assets.status = 'attached'
        ) lesson_files on true
        order by
          course_rows.sort_order asc nulls last,
          course_rows.created_at asc nulls last,
          module_rows.sort_order asc nulls last,
          module_rows.created_at asc nulls last,
          lesson_rows.sort_order asc nulls last,
          lesson_rows.created_at asc nulls last
      `);
      const rows = (result.rows ?? []) as CourseTreeRow[];

      return buildCourseTree(rows);
    });
  }
}
