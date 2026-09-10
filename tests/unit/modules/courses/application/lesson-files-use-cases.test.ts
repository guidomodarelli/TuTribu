import { vi, describe, it, expect } from "vitest";
import {
  COURSE_MUTATION_STATUS,
  LESSON_FILE_PREPARATION_STATUS,
  LESSON_FILES,
} from "@/src/modules/courses/constants/courses";
import {
  NORMALIZED_LESSON_FILES_STATUS,
  createLessonFileUpload,
  normalizeLessonFileDrafts,
} from "@/src/modules/courses/application/use-cases/lesson-files-use-cases";
import {
  createLesson,
  deleteLesson,
  updateLesson,
} from "@/src/modules/courses/application/use-cases/manage-tribe-courses-use-cases";
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";

const FILE_ID = "a3bb189e-8bf9-4888-9912-ace4e6543002";

const BASE_LESSON_COMMAND = {
  courseModuleId: "c4dd391a-9c0a-4999-aa23-bdf5f7654113",
  description: "Notas de la clase",
  externalVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  sortOrder: 0,
  title: "Leccion 1",
  tribeSlug: "mi-tribu",
  userId: "leader-1",
};

function createCourseRepositoryDouble(
  overrides: Partial<CourseRepository> = {}
): CourseRepository {
  return {
    createCourseModule: vi.fn(),
    createLesson: vi.fn(async () => ({
      lesson: { id: "lesson-1" },
      status: COURSE_MUTATION_STATUS.created,
    })) as unknown as CourseRepository["createLesson"],
    deleteCourseModule: vi.fn(),
    deleteLesson: vi.fn(async () => ({
      status: COURSE_MUTATION_STATUS.deleted,
    })) as unknown as CourseRepository["deleteLesson"],
    getEditableTreeByTribeSlug: vi.fn(),
    getTreeByTribeSlug: vi.fn(),
    updateCourseModule: vi.fn(),
    updateLesson: vi.fn(async () => ({
      lesson: { id: "lesson-1" },
      status: COURSE_MUTATION_STATUS.updated,
    })) as unknown as CourseRepository["updateLesson"],
    ...overrides,
  } as CourseRepository;
}

describe("normalizeLessonFileDrafts", () => {
  it("derives sortOrder from the array index", () => {
    expect(normalizeLessonFileDrafts([{ assetId: FILE_ID }])).toEqual({
      files: [{ assetId: FILE_ID, sortOrder: 0 }],
      status: NORMALIZED_LESSON_FILES_STATUS.valid,
    });
  });

  it("rejects lists above the per-lesson ceiling", () => {
    const drafts = Array.from(
      { length: LESSON_FILES.maxCount + 1 },
      (unused, index) => ({
        assetId: `${index.toString(16)}3bb189e-8bf9-4888-9912-ace4e6543002`,
      })
    );

    expect(normalizeLessonFileDrafts(drafts)).toEqual({
      status: COURSE_MUTATION_STATUS.invalidFile,
    });
  });
});

describe("createLessonFileUpload", () => {
  it("rejects disallowed MIME types without touching the repository", async () => {
    const createUpload = vi.fn();
    const execute = createLessonFileUpload({
      lessonFileRepository: { createUpload },
    });

    await expect(
      execute({
        fileName: "script.sh",
        fileSizeBytes: 10,
        mimeType: "application/x-sh",
        tribeSlug: "mi-tribu",
        userId: "leader-1",
      })
    ).resolves.toEqual({ status: COURSE_MUTATION_STATUS.invalidFile });

    expect(createUpload).not.toHaveBeenCalled();
  });

  it("normalizes the declaration and reserves the upload", async () => {
    const createUpload = vi.fn(async () => ({
      assetId: FILE_ID,
      status: COURSE_MUTATION_STATUS.created,
      uploadHeaders: {},
      uploadUrl: "https://example.com/upload",
    }));
    const execute = createLessonFileUpload({
      lessonFileRepository: { createUpload },
    });

    await execute({
      fileName: "  apunte.pdf ",
      fileSizeBytes: 512,
      mimeType: "APPLICATION/pdf",
      tribeSlug: " mi-tribu ",
      userId: " leader-1 ",
    });

    expect(createUpload).toHaveBeenCalledWith({
      fileName: "apunte.pdf",
      fileSizeBytes: 512,
      mimeType: "application/pdf",
      tribeSlug: "mi-tribu",
      userId: "leader-1",
    });
  });
});

describe("createLesson with file attachments", () => {
  it("prepares the drafts and forwards them to the repository", async () => {
    const courseRepository = createCourseRepositoryDouble();
    const prepareForAttachment = vi.fn(async (command) => ({
      files: command.files,
      status: LESSON_FILE_PREPARATION_STATUS.ready,
    }));
    const execute = createLesson({
      courseRepository,
      lessonFileRepository: {
        deleteFile: vi.fn(),
        deletePendingFiles: vi.fn(),
        prepareForAttachment,
      },
    });

    await execute({ ...BASE_LESSON_COMMAND, files: [{ assetId: FILE_ID }] });

    expect(prepareForAttachment).toHaveBeenCalledWith({
      files: [{ assetId: FILE_ID, sortOrder: 0 }],
      tribeSlug: "mi-tribu",
      userId: "leader-1",
    });
    expect(courseRepository.createLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [{ assetId: FILE_ID, sortOrder: 0 }],
      })
    );
  });

  it("returns invalid_file and reclaims drafts when preparation fails", async () => {
    const courseRepository = createCourseRepositoryDouble();
    const deleteFile = vi.fn(async () => ({
      status: COURSE_MUTATION_STATUS.deleted,
    }));
    const execute = createLesson({
      courseRepository,
      lessonFileRepository: {
        deleteFile,
        deletePendingFiles: vi.fn(),
        prepareForAttachment: vi.fn(async () => ({
          status: COURSE_MUTATION_STATUS.invalidFile,
        })),
      },
    });

    await expect(
      execute({ ...BASE_LESSON_COMMAND, files: [{ assetId: FILE_ID }] })
    ).resolves.toEqual({ status: COURSE_MUTATION_STATUS.invalidFile });

    expect(courseRepository.createLesson).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledWith({
      fileId: FILE_ID,
      tribeSlug: "mi-tribu",
      userId: "leader-1",
    });
  });
});

describe("updateLesson with file attachments", () => {
  it("omits attachment work when the command carries no files field", async () => {
    const courseRepository = createCourseRepositoryDouble();
    const prepareForAttachment = vi.fn();
    const deletePendingFiles = vi.fn();
    const execute = updateLesson({
      courseRepository,
      lessonFileRepository: {
        deleteFile: vi.fn(),
        deletePendingFiles,
        prepareForAttachment,
      },
    });

    await execute({
      ...BASE_LESSON_COMMAND,
      isActive: true,
      lessonId: FILE_ID,
    });

    expect(prepareForAttachment).not.toHaveBeenCalled();
    expect(deletePendingFiles).not.toHaveBeenCalled();
    expect(courseRepository.updateLesson).toHaveBeenCalledWith(
      expect.not.objectContaining({ files: expect.anything() })
    );
  });

  it("replaces the set and drains detached files after a successful update", async () => {
    const courseRepository = createCourseRepositoryDouble();
    const deletePendingFiles = vi.fn();
    const execute = updateLesson({
      courseRepository,
      lessonFileRepository: {
        deleteFile: vi.fn(),
        deletePendingFiles,
        prepareForAttachment: vi.fn(async (command) => ({
          files: command.files,
          status: LESSON_FILE_PREPARATION_STATUS.ready,
        })),
      },
    });

    await execute({
      ...BASE_LESSON_COMMAND,
      files: [{ assetId: FILE_ID }],
      isActive: true,
      lessonId: FILE_ID,
    });

    expect(courseRepository.updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [{ assetId: FILE_ID, sortOrder: 0 }],
      })
    );
    expect(deletePendingFiles).toHaveBeenCalledWith({
      lessonId: FILE_ID,
      tribeSlug: "mi-tribu",
      userId: "leader-1",
    });
  });
});

describe("deleteLesson", () => {
  it("drains the pending lesson files after a successful deletion", async () => {
    const courseRepository = createCourseRepositoryDouble();
    const deletePendingFiles = vi.fn();
    const execute = deleteLesson({
      courseRepository,
      lessonFileRepository: {
        deleteFile: vi.fn(),
        deletePendingFiles,
        prepareForAttachment: vi.fn(),
      },
    });

    await execute({
      lessonId: FILE_ID,
      tribeSlug: "mi-tribu",
      userId: "leader-1",
    });

    expect(deletePendingFiles).toHaveBeenCalledWith({
      lessonId: FILE_ID,
      tribeSlug: "mi-tribu",
      userId: "leader-1",
    });
  });
});
