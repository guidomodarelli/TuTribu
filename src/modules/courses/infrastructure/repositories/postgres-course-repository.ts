import { sql } from "drizzle-orm";

import type {
  CreateCourseModuleCommand,
  DeleteCourseModuleCommand,
  GetTribeCoursesQuery,
  UpdateCourseModuleCommand,
} from "@/src/modules/courses/application/commands/course-commands";
import type {
  CourseModuleCreationResult,
  CourseModuleDeletionResult,
  CourseModuleResult,
  CourseModuleUpdateResult,
  CourseModuleWithLessonsResult,
  CourseTreeResult,
  LessonCreationResult,
  LessonDeletionResult,
  LessonResult,
  LessonUpdateResult,
} from "@/src/modules/courses/application/results/course-results";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import type {
  CourseRepository,
  CreateLessonRepositoryCommand,
  DeleteLessonRepositoryCommand,
  UpdateLessonRepositoryCommand,
} from "@/src/modules/courses/domain/repositories/course-repository";
import type { LessonFileAttachmentDraft } from "@/src/modules/courses/domain/repositories/lesson-file-repository";
import type { LessonFile } from "@/src/modules/courses/domain/entities/lesson-file";
import { LESSON_FILE_STATUS } from "@/src/modules/courses/constants/courses";
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

type CourseModuleRow = {
  id: string;
  is_active: boolean;
  sort_order: number;
  title: string;
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
  lesson_course_module_id: string | null;
  lesson_description: string | null;
  lesson_external_video_id: string | null;
  lesson_files: LessonFileRow[] | null;
  lesson_id: string | null;
  lesson_is_active: boolean | null;
  lesson_sort_order: number | null;
  lesson_title: string | null;
  lesson_video_provider: string | null;
  module_id: string | null;
  module_is_active: boolean | null;
  module_sort_order: number | null;
  module_title: string | null;
};

function mapCourseModule(row: CourseModuleRow): CourseModuleResult {
  return {
    id: row.id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    title: row.title,
  };
}

function mapLesson(row: LessonRow, files: LessonFile[] = []): LessonResult {
  return {
    courseModuleId: row.course_module_id,
    description: row.description,
    externalVideoId: row.external_video_id,
    files,
    id: row.id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    title: row.title,
    videoProvider: row.video_provider as VideoProvider,
  };
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
  files: LessonFile[] = []
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
  const moduleMap = new Map<string, CourseModuleWithLessonsResult>();
  const moduleOrder: string[] = [];

  for (const row of rows) {
    if (!row.module_id) {
      continue;
    }

    let courseModule = moduleMap.get(row.module_id);
    if (!courseModule) {
      courseModule = {
        id: row.module_id,
        isActive: Boolean(row.module_is_active),
        lessons: [],
        sortOrder: row.module_sort_order ?? 0,
        title: row.module_title ?? "",
      };
      moduleMap.set(row.module_id, courseModule);
      moduleOrder.push(row.module_id);
    }

    if (row.lesson_id) {
      courseModule.lessons.push({
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
    modules: moduleOrder.map((moduleId) => moduleMap.get(moduleId)!),
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

  async createCourseModule(
    command: CreateCourseModuleCommand
  ): Promise<CourseModuleCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        inserted_module as (
          insert into public.course_modules (
            tribe_id,
            title,
            sort_order,
            is_active,
            created_at,
            updated_at
          )
          select
            target_tribe.id,
            ${command.title},
            ${command.sortOrder},
            true,
            timezone('utc', now()),
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_courses(target_tribe.id)
          returning id, title, sort_order, is_active
        )
        select
          case
            when exists (select 1 from inserted_module) then ${COURSE_MUTATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status,
          inserted_module.id,
          inserted_module.title,
          inserted_module.sort_order,
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
    command: UpdateCourseModuleCommand
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
            is_active = ${command.isActive},
            updated_at = timezone('utc', now())
          from target_tribe
          where course_modules.id = ${command.courseModuleId}
            and course_modules.tribe_id = target_tribe.id
            and public.can_manage_tribe_courses(target_tribe.id)
          returning course_modules.id, course_modules.title, course_modules.sort_order, course_modules.is_active
        )
        select
          case
            when exists (select 1 from updated_module) then ${COURSE_MUTATION_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${COURSE_MUTATION_STATUS.notFound}
            when not exists (select 1 from target_module) then ${COURSE_MUTATION_STATUS.notFound}
            else ${COURSE_MUTATION_STATUS.forbidden}
          end as status,
          updated_module.id,
          updated_module.title,
          updated_module.sort_order,
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
    command: DeleteCourseModuleCommand
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
        let attachedFiles: LessonFile[] = [];

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
        viewer_permissions as (
          select coalesce(public.can_manage_tribe_courses((select id from target_tribe)), false) as can_manage_courses
        ),
        module_rows as (
          select
            course_modules.id,
            course_modules.title,
            course_modules.sort_order,
            course_modules.is_active,
            course_modules.created_at
          from public.course_modules
          inner join target_tribe
            on target_tribe.id = course_modules.tribe_id
          where ${includeInactive} or course_modules.is_active = true
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
        )
        select
          viewer_permissions.can_manage_courses,
          module_rows.id          as module_id,
          module_rows.title       as module_title,
          module_rows.sort_order  as module_sort_order,
          module_rows.is_active   as module_is_active,
          lesson_rows.id                  as lesson_id,
          lesson_rows.course_module_id    as lesson_course_module_id,
          lesson_rows.title               as lesson_title,
          lesson_rows.video_provider      as lesson_video_provider,
          lesson_rows.external_video_id   as lesson_external_video_id,
          lesson_rows.description         as lesson_description,
          lesson_rows.sort_order          as lesson_sort_order,
          lesson_rows.is_active           as lesson_is_active,
          coalesce(lesson_files.lesson_files, '[]'::jsonb) as lesson_files
        from viewer_permissions
        left join module_rows
          on true
        left join lesson_rows
          on lesson_rows.course_module_id = module_rows.id
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
