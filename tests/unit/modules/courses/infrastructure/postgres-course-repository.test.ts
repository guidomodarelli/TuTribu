import { vi, describe, it, expect } from "vitest";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";
import { PostgresCourseRepository } from "@/src/modules/courses/infrastructure/repositories/postgres-course-repository";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "queryChunks" in chunk &&
        Array.isArray((chunk as { queryChunks: unknown }).queryChunks)
      ) {
        // Nested sql`` fragments (e.g. the completion insert/delete branch)
        // carry their own chunk list.
        return getSqlText(chunk);
      }

      return "";
    })
    .join("");
}

describe("PostgresCourseRepository", () => {
  it("builds a course tree grouping lessons by module across providers", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          can_manage_courses: true,
          course_cover_image_url: null,
          course_description: "Curso base",
          course_id: "c1",
          course_is_active: true,
          course_last_viewed_lesson_id: "l2",
          course_sort_order: 0,
          course_title: "Inversiones",
          lesson_completed: true,
          lesson_course_module_id: "m1",
          lesson_description: "Texto",
          lesson_external_video_id: "123",
          lesson_id: "l1",
          lesson_is_active: true,
          lesson_sort_order: 0,
          lesson_title: "Lección Vimeo",
          lesson_video_provider: "vimeo",
          module_course_id: "c1",
          module_id: "m1",
          module_is_active: true,
          module_is_locked: false,
          module_sort_order: 0,
          module_title: "Empezar acá",
          module_unlock_after_days: null,
          module_unlocks_at: null,
        },
        {
          can_manage_courses: true,
          course_cover_image_url: null,
          course_description: "Curso base",
          course_id: "c1",
          course_is_active: true,
          course_last_viewed_lesson_id: "l2",
          course_sort_order: 0,
          course_title: "Inversiones",
          lesson_completed: false,
          lesson_course_module_id: "m1",
          lesson_description: null,
          lesson_external_video_id: "dQw4w9WgXcQ",
          lesson_id: "l2",
          lesson_is_active: true,
          lesson_sort_order: 1,
          lesson_title: "Lección YT",
          lesson_video_provider: "youtube",
          module_course_id: "c1",
          module_id: "m1",
          module_is_active: true,
          module_is_locked: false,
          module_sort_order: 0,
          module_title: "Empezar acá",
          module_unlock_after_days: null,
          module_unlocks_at: null,
        },
        {
          can_manage_courses: true,
          course_cover_image_url: null,
          course_description: "Curso base",
          course_id: "c1",
          course_is_active: true,
          course_last_viewed_lesson_id: "l2",
          course_sort_order: 0,
          course_title: "Inversiones",
          lesson_completed: null,
          lesson_course_module_id: null,
          lesson_description: null,
          lesson_external_video_id: null,
          lesson_id: null,
          lesson_is_active: null,
          lesson_sort_order: null,
          lesson_title: null,
          lesson_video_provider: null,
          module_course_id: "c1",
          module_id: "m2",
          module_is_active: true,
          module_is_locked: true,
          module_sort_order: 1,
          module_title: "Renta fija",
          module_unlock_after_days: 14,
          module_unlocks_at: "2026-07-20T00:00:00Z",
        },
      ],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.getTreeByTribeSlug({
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      courses: [
        {
          coverImageUrl: null,
          description: "Curso base",
          id: "c1",
          isActive: true,
          lastViewedLessonId: "l2",
          modules: [
            {
              courseId: "c1",
              id: "m1",
              isActive: true,
              lessons: [
                {
                  completed: true,
                  courseModuleId: "m1",
                  description: "Texto",
                  externalVideoId: "123",
                  files: [],
                  id: "l1",
                  isActive: true,
                  sortOrder: 0,
                  title: "Lección Vimeo",
                  videoProvider: VIDEO_PROVIDER.vimeo,
                },
                {
                  completed: false,
                  courseModuleId: "m1",
                  description: null,
                  externalVideoId: "dQw4w9WgXcQ",
                  files: [],
                  id: "l2",
                  isActive: true,
                  sortOrder: 1,
                  title: "Lección YT",
                  videoProvider: VIDEO_PROVIDER.youtube,
                },
              ],
              sortOrder: 0,
              title: "Empezar acá",
              unlockAfterDays: null,
              viewerAccess: { isLocked: false, unlocksAt: null },
            },
            {
              courseId: "c1",
              id: "m2",
              isActive: true,
              lessons: [],
              sortOrder: 1,
              title: "Renta fija",
              unlockAfterDays: 14,
              viewerAccess: {
                isLocked: true,
                unlocksAt: "2026-07-20T00:00:00Z",
              },
            },
          ],
          sortOrder: 0,
          title: "Inversiones",
        },
      ],
      viewerPermissions: { canManageCourses: true },
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("public.can_manage_tribe_courses");
    expect(sqlText).toContain("lesson_video_provider");
    expect(sqlText).toContain("lesson_external_video_id");
    expect(sqlText).toContain("course_last_viewed_lesson_id");
    expect(sqlText).toContain("module_is_locked");
  });

  it("returns an empty tree when the tribe has no courses", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          can_manage_courses: false,
          course_cover_image_url: null,
          course_description: null,
          course_id: null,
          course_is_active: null,
          course_last_viewed_lesson_id: null,
          course_sort_order: null,
          course_title: null,
          lesson_completed: null,
          lesson_course_module_id: null,
          lesson_description: null,
          lesson_external_video_id: null,
          lesson_id: null,
          lesson_is_active: null,
          lesson_sort_order: null,
          lesson_title: null,
          lesson_video_provider: null,
          module_course_id: null,
          module_id: null,
          module_is_active: null,
          module_is_locked: null,
          module_sort_order: null,
          module_title: null,
          module_unlock_after_days: null,
          module_unlocks_at: null,
        },
      ],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.getTreeByTribeSlug({
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      courses: [],
      viewerPermissions: { canManageCourses: false },
    });
  });

  it("returns a created status with the new course", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          cover_image_url: "https://example.com/portada.jpg",
          description: "Curso base",
          id: "c1",
          is_active: true,
          sort_order: 0,
          status: "created" as const,
          title: "Inversiones",
        },
      ],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.createCourse({
      coverImageUrl: "https://example.com/portada.jpg",
      description: "Curso base",
      sortOrder: 0,
      title: "Inversiones",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      course: {
        coverImageUrl: "https://example.com/portada.jpg",
        description: "Curso base",
        id: "c1",
        isActive: true,
        sortOrder: 0,
        title: "Inversiones",
      },
      status: "created" as const,
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("insert into public.courses");
    expect(sqlText).toContain("public.can_manage_tribe_courses");
  });

  it("marks a lesson as completed guarding membership and drip unlock", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ mutated: true, status: "completed" as const }],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.setLessonCompletion({
      completed: true,
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "completed" as const });
    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("insert into public.course_lesson_completions");
    expect(sqlText).toContain("public.can_read_tribe_courses");
    expect(sqlText).toContain("public.is_course_module_unlocked");
  });

  it("removes a completion when toggling off", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ mutated: true, status: "uncompleted" as const }],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.setLessonCompletion({
      completed: false,
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "uncompleted" as const });
    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("delete from public.course_lesson_completions");
  });

  it("upserts the last viewed lesson with authorization guards", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "recorded" as const }],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.recordLastViewedLesson({
      courseId: "c1",
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "recorded" as const });
    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("insert into public.course_last_viewed_lessons");
    expect(sqlText).toContain("on conflict (course_id, user_id) do update");
    expect(sqlText).toContain("public.is_course_module_unlocked");
  });

  it("returns a created status with the new course module", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          course_id: "c1",
          id: "m1",
          is_active: true,
          sort_order: 0,
          status: "created" as const,
          title: "Empezar acá",
          unlock_after_days: null,
        },
      ],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.createCourseModule({
      courseId: "c1",
      sortOrder: 0,
      title: "Empezar acá",
      tribeSlug: "matematica-pro",
      unlockAfterDays: null,
    });

    expect(result).toEqual({
      courseModule: {
        courseId: "c1",
        id: "m1",
        isActive: true,
        sortOrder: 0,
        title: "Empezar acá",
        unlockAfterDays: null,
      },
      status: "created" as const,
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("insert into public.course_modules");
    expect(sqlText).toContain("public.can_manage_tribe_courses");
  });

  it("returns forbidden when leader permissions are missing on module creation", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          id: null,
          is_active: null,
          sort_order: null,
          status: "forbidden" as const,
          title: null,
        },
      ],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.createCourseModule({
      courseId: "c1",
      sortOrder: 0,
      title: "Empezar acá",
      tribeSlug: "matematica-pro",
      unlockAfterDays: null,
    });

    expect(result).toEqual({ status: "forbidden" as const });
  });

  it("returns not_found when the tribe slug does not exist on module creation", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          id: null,
          is_active: null,
          sort_order: null,
          status: "not_found" as const,
          title: null,
        },
      ],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.createCourseModule({
      courseId: "c1",
      sortOrder: 0,
      title: "Empezar acá",
      tribeSlug: "unknown-tribe",
      unlockAfterDays: null,
    });

    expect(result).toEqual({ status: "not_found" as const });
  });

  it("returns the lesson result when creation succeeds with provider + id", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          course_module_id: "m1",
          description: null,
          external_video_id: "abc12345xy",
          id: "l1",
          is_active: true,
          sort_order: 0,
          status: "created" as const,
          title: "Lección Wistia",
          video_provider: "wistia",
        },
      ],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.createLesson({
      courseModuleId: "m1",
      description: null,
      externalVideoId: "abc12345xy",
      sortOrder: 0,
      title: "Lección Wistia",
      tribeSlug: "matematica-pro",
      videoProvider: VIDEO_PROVIDER.wistia,
    });

    expect(result).toEqual({
      lesson: {
        courseModuleId: "m1",
        description: null,
        externalVideoId: "abc12345xy",
        files: [],
        id: "l1",
        isActive: true,
        sortOrder: 0,
        title: "Lección Wistia",
        videoProvider: VIDEO_PROVIDER.wistia,
      },
      status: "created" as const,
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("insert into public.course_lessons");
    expect(sqlText).toContain("video_provider");
    expect(sqlText).toContain("external_video_id");
  });

  it("returns invalid_file when a stale asset id cannot be attached during lesson creation", async () => {
    const execute = vi
      .fn()
      // createLesson SQL: lesson inserted successfully
      .mockResolvedValueOnce({
        rows: [
          {
            course_module_id: "m1",
            description: null,
            external_video_id: "abc12345xy",
            id: "l1",
            is_active: true,
            sort_order: 0,
            status: "created" as const,
            title: "Lección Wistia",
            tribe_id: "t1",
            video_provider: "wistia",
          },
        ],
      })
      // replaceLessonFiles: pending_delete UPDATE (no rows to detach on a new lesson)
      .mockResolvedValueOnce({ rows: [] })
      // replaceLessonFiles: attach UPDATE returns 0 rows — stale asset id
      .mockResolvedValueOnce({ rows: [{ lesson_files: [] }] });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.createLesson({
      courseModuleId: "m1",
      description: null,
      externalVideoId: "abc12345xy",
      files: [
        {
          assetId: "00000000-0000-4000-8000-000000000001",
          sortOrder: 0,
        },
      ],
      sortOrder: 0,
      title: "Lección Wistia",
      tribeSlug: "matematica-pro",
      videoProvider: VIDEO_PROVIDER.wistia,
    });

    expect(result).toEqual({ status: "invalid_file" as const });
  });

  it("returns invalid_file when a stale asset id cannot be attached during lesson update", async () => {
    const execute = vi
      .fn()
      // updateLesson SQL: lesson updated successfully
      .mockResolvedValueOnce({
        rows: [
          {
            course_module_id: "m1",
            description: null,
            external_video_id: "abc12345xy",
            id: "l1",
            is_active: true,
            sort_order: 0,
            status: "updated" as const,
            title: "Lección Wistia",
            tribe_id: "t1",
            video_provider: "wistia",
          },
        ],
      })
      // replaceLessonFiles: pending_delete detaches existing attached files
      .mockResolvedValueOnce({ rows: [] })
      // replaceLessonFiles: attach UPDATE returns 0 rows — stale asset id
      .mockResolvedValueOnce({ rows: [{ lesson_files: [] }] });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.updateLesson({
      courseModuleId: "m1",
      description: null,
      externalVideoId: "abc12345xy",
      files: [
        {
          assetId: "00000000-0000-4000-8000-000000000001",
          sortOrder: 0,
        },
      ],
      isActive: true,
      lessonId: "l1",
      sortOrder: 0,
      title: "Lección Wistia",
      tribeSlug: "matematica-pro",
      videoProvider: VIDEO_PROVIDER.wistia,
    });

    expect(result).toEqual({ status: "invalid_file" as const });
  });

  it("returns deleted status when a course module is deleted", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "deleted" as const }],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.deleteCourseModule({
      courseModuleId: "m1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "deleted" as const });
    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("delete from public.course_modules");
  });

  it("returns deleted status when a lesson is deleted", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "deleted" as const }],
    }); });
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.deleteLesson({
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "deleted" as const });
    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("delete from public.course_lessons");
  });

  it("returns invalid_file and propagates error out of executor callback when createLesson file attachment fails", async () => {
    // Call 1: INSERT lesson → created
    // Call 2: UPDATE to detach existing files (replaceLessonFiles step 1)
    // Call 3: UPDATE + SELECT to attach new files → returns fewer rows than requested, triggering the conflict error
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            course_module_id: "m1",
            description: null,
            external_video_id: "abc12345xy",
            id: "l1",
            is_active: true,
            sort_order: 0,
            status: "created" as const,
            title: "Lección Wistia",
            tribe_id: "tribe-1",
            video_provider: "wistia",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ lesson_files: [] }] });

    let callbackThrewError = false;
    const executor = async <Result,>(callback: (db: never) => Promise<Result>) => {
      try {
        return await callback({ execute } as never);
      } catch (error) {
        callbackThrewError = true;
        throw error;
      }
    };
    const repository = new PostgresCourseRepository(executor);

    const result = await repository.createLesson({
      courseModuleId: "m1",
      description: null,
      externalVideoId: "abc12345xy",
      files: [{ assetId: "file-uuid-1", sortOrder: 0 }],
      sortOrder: 0,
      title: "Lección Wistia",
      tribeSlug: "matematica-pro",
      videoProvider: VIDEO_PROVIDER.wistia,
    });

    expect(result).toEqual({ status: "invalid_file" as const });
    expect(callbackThrewError).toBe(true);
  });

  it("returns invalid_file and propagates error out of executor callback when updateLesson file attachment fails", async () => {
    // Call 1: UPDATE lesson → updated
    // Call 2: UPDATE to detach existing files (replaceLessonFiles step 1)
    // Call 3: UPDATE + SELECT to attach new files → returns fewer rows than requested, triggering the conflict error
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            course_module_id: "m1",
            description: null,
            external_video_id: "abc12345xy",
            id: "l1",
            is_active: true,
            sort_order: 0,
            status: "updated" as const,
            title: "Lección Wistia",
            tribe_id: "tribe-1",
            video_provider: "wistia",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ lesson_files: [] }] });

    let callbackThrewError = false;
    const executor = async <Result,>(callback: (db: never) => Promise<Result>) => {
      try {
        return await callback({ execute } as never);
      } catch (error) {
        callbackThrewError = true;
        throw error;
      }
    };
    const repository = new PostgresCourseRepository(executor);

    const result = await repository.updateLesson({
      courseModuleId: "m1",
      description: null,
      externalVideoId: "abc12345xy",
      files: [{ assetId: "file-uuid-1", sortOrder: 0 }],
      isActive: true,
      lessonId: "l1",
      sortOrder: 0,
      title: "Lección Wistia",
      tribeSlug: "matematica-pro",
      videoProvider: VIDEO_PROVIDER.wistia,
    });

    expect(result).toEqual({ status: "invalid_file" as const });
    expect(callbackThrewError).toBe(true);
  });
});
