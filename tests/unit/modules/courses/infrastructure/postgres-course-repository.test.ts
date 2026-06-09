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

      return "";
    })
    .join("");
}

describe("PostgresCourseRepository", () => {
  it("builds a course tree grouping lessons by module across providers", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          can_manage_courses: true,
          lesson_course_module_id: "m1",
          lesson_description: "Texto",
          lesson_external_video_id: "123",
          lesson_id: "l1",
          lesson_is_active: true,
          lesson_sort_order: 0,
          lesson_title: "Lección Vimeo",
          lesson_video_provider: "vimeo",
          module_id: "m1",
          module_is_active: true,
          module_sort_order: 0,
          module_title: "Empezar acá",
        },
        {
          can_manage_courses: true,
          lesson_course_module_id: "m1",
          lesson_description: null,
          lesson_external_video_id: "dQw4w9WgXcQ",
          lesson_id: "l2",
          lesson_is_active: true,
          lesson_sort_order: 1,
          lesson_title: "Lección YT",
          lesson_video_provider: "youtube",
          module_id: "m1",
          module_is_active: true,
          module_sort_order: 0,
          module_title: "Empezar acá",
        },
        {
          can_manage_courses: true,
          lesson_course_module_id: null,
          lesson_description: null,
          lesson_external_video_id: null,
          lesson_id: null,
          lesson_is_active: null,
          lesson_sort_order: null,
          lesson_title: null,
          lesson_video_provider: null,
          module_id: "m2",
          module_is_active: true,
          module_sort_order: 1,
          module_title: "Renta fija",
        },
      ],
    }));
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.getTreeByTribeSlug({
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      modules: [
        {
          id: "m1",
          isActive: true,
          lessons: [
            {
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
        },
        {
          id: "m2",
          isActive: true,
          lessons: [],
          sortOrder: 1,
          title: "Renta fija",
        },
      ],
      viewerPermissions: { canManageCourses: true },
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("public.can_manage_tribe_courses");
    expect(sqlText).toContain("lesson_video_provider");
    expect(sqlText).toContain("lesson_external_video_id");
  });

  it("returns an empty tree when the tribe has no modules", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          can_manage_courses: false,
          lesson_course_module_id: null,
          lesson_description: null,
          lesson_external_video_id: null,
          lesson_id: null,
          lesson_is_active: null,
          lesson_sort_order: null,
          lesson_title: null,
          lesson_video_provider: null,
          module_id: null,
          module_is_active: null,
          module_sort_order: null,
          module_title: null,
        },
      ],
    }));
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.getTreeByTribeSlug({
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      modules: [],
      viewerPermissions: { canManageCourses: false },
    });
  });

  it("returns a created status with the new course module", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          id: "m1",
          is_active: true,
          sort_order: 0,
          status: "created",
          title: "Empezar acá",
        },
      ],
    }));
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.createCourseModule({
      sortOrder: 0,
      title: "Empezar acá",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      courseModule: {
        id: "m1",
        isActive: true,
        sortOrder: 0,
        title: "Empezar acá",
      },
      status: "created",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("insert into public.course_modules");
    expect(sqlText).toContain("public.can_manage_tribe_courses");
  });

  it("returns forbidden when leader permissions are missing on module creation", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          id: null,
          is_active: null,
          sort_order: null,
          status: "forbidden",
          title: null,
        },
      ],
    }));
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.createCourseModule({
      sortOrder: 0,
      title: "Empezar acá",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "forbidden" });
  });

  it("returns not_found when the tribe slug does not exist on module creation", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          id: null,
          is_active: null,
          sort_order: null,
          status: "not_found",
          title: null,
        },
      ],
    }));
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.createCourseModule({
      sortOrder: 0,
      title: "Empezar acá",
      tribeSlug: "unknown-tribe",
    });

    expect(result).toEqual({ status: "not_found" });
  });

  it("returns the lesson result when creation succeeds with provider + id", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          course_module_id: "m1",
          description: null,
          external_video_id: "abc12345xy",
          id: "l1",
          is_active: true,
          sort_order: 0,
          status: "created",
          title: "Lección Wistia",
          video_provider: "wistia",
        },
      ],
    }));
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
      status: "created",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("insert into public.course_lessons");
    expect(sqlText).toContain("video_provider");
    expect(sqlText).toContain("external_video_id");
  });

  it("returns deleted status when a course module is deleted", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ status: "deleted" }],
    }));
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.deleteCourseModule({
      courseModuleId: "m1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "deleted" });
    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("delete from public.course_modules");
  });

  it("returns deleted status when a lesson is deleted", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ status: "deleted" }],
    }));
    const repository = new PostgresCourseRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.deleteLesson({
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "deleted" });
    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("delete from public.course_lessons");
  });
});
