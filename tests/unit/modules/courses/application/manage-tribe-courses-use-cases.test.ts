import {
  createCourseModule,
  createLesson,
  deleteCourseModule,
  deleteLesson,
  getEditableTribeCourses,
  getTribeCourses,
  updateCourseModule,
  updateLesson,
} from "@/src/modules/courses/application/use-cases/manage-tribe-courses-use-cases";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";

function buildRepository(
  overrides: Partial<CourseRepository> = {}
): CourseRepository {
  return {
    createCourseModule: jest.fn(async () => ({
      courseModule: { id: "m1", isActive: true, sortOrder: 0, title: "M" },
      status: "created",
    })),
    createLesson: jest.fn(async () => ({
      lesson: {
        courseModuleId: "m1",
        description: null,
        externalVideoId: "123456789",
        id: "l1",
        isActive: true,
        sortOrder: 0,
        title: "L",
        videoProvider: VIDEO_PROVIDER.vimeo,
      },
      status: "created",
    })),
    deleteCourseModule: jest.fn(async () => ({ status: "deleted" })),
    deleteLesson: jest.fn(async () => ({ status: "deleted" })),
    getEditableTreeByTribeSlug: jest.fn(async () => ({
      modules: [],
      viewerPermissions: { canManageCourses: true },
    })),
    getTreeByTribeSlug: jest.fn(async () => ({
      modules: [],
      viewerPermissions: { canManageCourses: false },
    })),
    updateCourseModule: jest.fn(async () => ({
      courseModule: { id: "m1", isActive: true, sortOrder: 0, title: "M" },
      status: "updated",
    })),
    updateLesson: jest.fn(async () => ({
      lesson: {
        courseModuleId: "m1",
        description: null,
        externalVideoId: "123456789",
        id: "l1",
        isActive: true,
        sortOrder: 0,
        title: "L",
        videoProvider: VIDEO_PROVIDER.vimeo,
      },
      status: "updated",
    })),
    ...overrides,
  };
}

describe("manage tribe courses use cases", () => {
  it("normalizes the tribe slug when listing the course tree", async () => {
    const repository = buildRepository();
    const useCase = getTribeCourses({ courseRepository: repository });

    await useCase({ tribeSlug: " matematica-pro " });

    expect(repository.getTreeByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("normalizes the tribe slug when listing the editable course tree", async () => {
    const repository = buildRepository();
    const useCase = getEditableTribeCourses({ courseRepository: repository });

    await useCase({ tribeSlug: " matematica-pro " });

    expect(repository.getEditableTreeByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("creates a course module with trimmed title", async () => {
    const repository = buildRepository();
    const useCase = createCourseModule({ courseRepository: repository });

    await useCase({
      sortOrder: 2,
      title: "  Empezar acá  ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.createCourseModule).toHaveBeenCalledWith({
      sortOrder: 2,
      title: "Empezar acá",
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects creating a course module with a blank title", async () => {
    const repository = buildRepository();
    const useCase = createCourseModule({ courseRepository: repository });

    const result = await useCase({
      sortOrder: 0,
      title: "   ",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "invalid_input" });
    expect(repository.createCourseModule).not.toHaveBeenCalled();
  });

  it("updates a course module with trimmed inputs", async () => {
    const repository = buildRepository();
    const useCase = updateCourseModule({ courseRepository: repository });

    await useCase({
      courseModuleId: " m1 ",
      isActive: false,
      sortOrder: 5,
      title: "  Renta fija  ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.updateCourseModule).toHaveBeenCalledWith({
      courseModuleId: "m1",
      isActive: false,
      sortOrder: 5,
      title: "Renta fija",
      tribeSlug: "matematica-pro",
    });
  });

  it("deletes a course module with normalized identifiers", async () => {
    const repository = buildRepository();
    const useCase = deleteCourseModule({ courseRepository: repository });

    await useCase({
      courseModuleId: " m1 ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.deleteCourseModule).toHaveBeenCalledWith({
      courseModuleId: "m1",
      tribeSlug: "matematica-pro",
    });
  });

  it("creates a lesson parsing a vimeo URL into provider + id", async () => {
    const repository = buildRepository();
    const useCase = createLesson({ courseRepository: repository });

    await useCase({
      courseModuleId: " m1 ",
      description: "  Una descripción  ",
      externalVideoUrl: "https://vimeo.com/123456789",
      sortOrder: 1,
      title: "  Lección 1  ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.createLesson).toHaveBeenCalledWith({
      courseModuleId: "m1",
      description: "Una descripción",
      externalVideoId: "123456789",
      sortOrder: 1,
      title: "Lección 1",
      tribeSlug: "matematica-pro",
      videoProvider: VIDEO_PROVIDER.vimeo,
    });
  });

  it("persists a markdown link in the lesson description verbatim", async () => {
    const repository = buildRepository();
    const useCase = createLesson({ courseRepository: repository });

    await useCase({
      courseModuleId: "m1",
      description: "Mirá [el curso](https://tutribu.com)",
      externalVideoUrl: "https://vimeo.com/123456789",
      sortOrder: 0,
      title: "Lección con link",
      tribeSlug: "matematica-pro",
    });

    expect(repository.createLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Mirá [el curso](https://tutribu.com)",
      })
    );
  });

  it("accepts a lesson description at the maximum length", async () => {
    const repository = buildRepository();
    const useCase = createLesson({ courseRepository: repository });

    await useCase({
      courseModuleId: "m1",
      description: "a".repeat(2000),
      externalVideoUrl: "https://vimeo.com/123456789",
      sortOrder: 0,
      title: "Lección larga",
      tribeSlug: "matematica-pro",
    });

    expect(repository.createLesson).toHaveBeenCalled();
  });

  it("rejects a lesson description longer than the maximum length", async () => {
    const repository = buildRepository();
    const useCase = createLesson({ courseRepository: repository });

    const result = await useCase({
      courseModuleId: "m1",
      description: "a".repeat(2001),
      externalVideoUrl: "https://vimeo.com/123456789",
      sortOrder: 0,
      title: "Lección demasiado larga",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "invalid_input" });
    expect(repository.createLesson).not.toHaveBeenCalled();
  });

  it("rejects updating a lesson with a description longer than the maximum", async () => {
    const repository = buildRepository();
    const useCase = updateLesson({ courseRepository: repository });

    const result = await useCase({
      courseModuleId: "m1",
      description: "a".repeat(2001),
      externalVideoUrl: "https://vimeo.com/123456789",
      isActive: true,
      lessonId: "l1",
      sortOrder: 0,
      title: "Lección",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "invalid_input" });
    expect(repository.updateLesson).not.toHaveBeenCalled();
  });

  it("creates a lesson from a YouTube URL", async () => {
    const repository = buildRepository();
    const useCase = createLesson({ courseRepository: repository });

    await useCase({
      courseModuleId: "m1",
      description: "",
      externalVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      sortOrder: 0,
      title: "Lección YT",
      tribeSlug: "matematica-pro",
    });

    expect(repository.createLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        externalVideoId: "dQw4w9WgXcQ",
        videoProvider: VIDEO_PROVIDER.youtube,
      })
    );
  });

  it("creates a lesson from a Wistia URL", async () => {
    const repository = buildRepository();
    const useCase = createLesson({ courseRepository: repository });

    await useCase({
      courseModuleId: "m1",
      description: "",
      externalVideoUrl: "https://acme.wistia.com/medias/abc12345xy",
      sortOrder: 0,
      title: "Lección Wistia",
      tribeSlug: "matematica-pro",
    });

    expect(repository.createLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        externalVideoId: "abc12345xy",
        videoProvider: VIDEO_PROVIDER.wistia,
      })
    );
  });

  it("creates a lesson from a Loom URL", async () => {
    const repository = buildRepository();
    const useCase = createLesson({ courseRepository: repository });

    await useCase({
      courseModuleId: "m1",
      description: "",
      externalVideoUrl:
        "https://www.loom.com/share/0123456789abcdef0123456789abcdef",
      sortOrder: 0,
      title: "Lección Loom",
      tribeSlug: "matematica-pro",
    });

    expect(repository.createLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        externalVideoId: "0123456789abcdef0123456789abcdef",
        videoProvider: VIDEO_PROVIDER.loom,
      })
    );
  });

  it("sets the lesson description to null when blank", async () => {
    const repository = buildRepository();
    const useCase = createLesson({ courseRepository: repository });

    await useCase({
      courseModuleId: "m1",
      description: "   ",
      externalVideoUrl: "https://vimeo.com/123456789",
      sortOrder: 0,
      title: "Lección 1",
      tribeSlug: "matematica-pro",
    });

    expect(repository.createLesson).toHaveBeenCalledWith(
      expect.objectContaining({ description: null })
    );
  });

  it("rejects creating a lesson with an unsupported video URL", async () => {
    const repository = buildRepository();
    const useCase = createLesson({ courseRepository: repository });

    const result = await useCase({
      courseModuleId: "m1",
      description: "",
      externalVideoUrl: "https://www.dailymotion.com/video/x7tgad0",
      sortOrder: 0,
      title: "Lección 1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "invalid_video_url" });
    expect(repository.createLesson).not.toHaveBeenCalled();
  });

  it("rejects creating a lesson with a blank title", async () => {
    const repository = buildRepository();
    const useCase = createLesson({ courseRepository: repository });

    const result = await useCase({
      courseModuleId: "m1",
      description: "",
      externalVideoUrl: "https://vimeo.com/123456789",
      sortOrder: 0,
      title: "   ",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "invalid_input" });
    expect(repository.createLesson).not.toHaveBeenCalled();
  });

  it("updates a lesson with normalized inputs and parsed video", async () => {
    const repository = buildRepository();
    const useCase = updateLesson({ courseRepository: repository });

    await useCase({
      courseModuleId: " m1 ",
      description: "  Texto  ",
      externalVideoUrl:
        "  https://player.vimeo.com/video/123456789?h=abc123  ",
      isActive: true,
      lessonId: " l1 ",
      sortOrder: 3,
      title: "  Nuevo título  ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.updateLesson).toHaveBeenCalledWith({
      courseModuleId: "m1",
      description: "Texto",
      externalVideoId: "123456789:abc123",
      isActive: true,
      lessonId: "l1",
      sortOrder: 3,
      title: "Nuevo título",
      tribeSlug: "matematica-pro",
      videoProvider: VIDEO_PROVIDER.vimeo,
    });
  });

  it("deletes a lesson with normalized identifiers", async () => {
    const repository = buildRepository();
    const useCase = deleteLesson({ courseRepository: repository });

    await useCase({
      lessonId: " l1 ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.deleteLesson).toHaveBeenCalledWith({
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });
  });
});
