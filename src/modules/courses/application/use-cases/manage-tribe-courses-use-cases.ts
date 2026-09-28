import type {
  CreateCourseCommand,
  CreateCourseModuleCommand,
  CreateLessonCommand,
  DeleteCourseCommand,
  DeleteCourseModuleCommand,
  DeleteLessonCommand,
  GetTribeCoursesQuery,
  UpdateCourseCommand,
  UpdateCourseModuleCommand,
  UpdateLessonCommand,
} from "@/src/modules/courses/application/commands/course-commands";
import type {
  CourseCreationResult,
  CourseDeletionResult,
  CourseModuleCreationResult,
  CourseModuleDeletionResult,
  CourseModuleUpdateResult,
  CourseTreeResult,
  CourseUpdateResult,
  LessonCreationResult,
  LessonDeletionResult,
  LessonUpdateResult,
} from "@/src/modules/courses/application/results/course-results";
import {
  COURSE_COVER_IMAGE_URL,
  COURSE_DESCRIPTION,
  COURSE_LESSON_DESCRIPTION,
  COURSE_LESSON_TITLE,
  COURSE_MODULE_UNLOCK_AFTER_DAYS,
  COURSE_MUTATION_STATUS,
  COURSE_ACCESS_REQUIREMENT,
  COURSE_TITLE,
  LESSON_FILE_PREPARATION_STATUS,
} from "@/src/modules/courses/constants/courses";
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";
import { parseCourseAccessRequirement } from "@/src/modules/courses/domain/value-objects/course-access-requirement";
import type {
  LessonFileAttachmentDraft,
  LessonFileRepository,
} from "@/src/modules/courses/domain/repositories/lesson-file-repository";
import {
  NORMALIZED_LESSON_FILES_STATUS,
  normalizeLessonFileDrafts,
} from "@/src/modules/courses/application/use-cases/lesson-files-use-cases";
import {
  InvalidVideoUrlError,
  parseExternalVideoUrl,
  type ParsedExternalVideo,
} from "@/src/modules/shared/domain/value-objects/external-video-url";

type CourseRepositoryDependencies = {
  courseRepository: CourseRepository;
};

type LessonMutationDependencies = CourseRepositoryDependencies & {
  lessonFileRepository?: Pick<
    LessonFileRepository,
    "deleteFile" | "deletePendingFiles" | "prepareForAttachment"
  >;
};

const COURSE_MODULE_TITLE_MAX_LENGTH = 120;
const HTTP_URL_PROTOCOLS = ["http:", "https:"] as const;

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeOptionalText(value: string): string | null {
  const normalized = normalizeText(value);

  return normalized.length > 0 ? normalized : null;
}

function isValidModuleTitle(title: string): boolean {
  return title.length > 0 && title.length <= COURSE_MODULE_TITLE_MAX_LENGTH;
}

function isValidCourseTitle(title: string): boolean {
  return title.length > 0 && title.length <= COURSE_TITLE.maxLength;
}

function isValidCourseDescription(description: string): boolean {
  return normalizeText(description).length <= COURSE_DESCRIPTION.maxLength;
}

function isValidCoverImageUrl(coverImageUrl: string | null): boolean {
  if (coverImageUrl === null) {
    return true;
  }

  if (coverImageUrl.length > COURSE_COVER_IMAGE_URL.maxLength) {
    return false;
  }

  try {
    const parsedUrl = new URL(coverImageUrl);

    return HTTP_URL_PROTOCOLS.some(
      (protocol) => protocol === parsedUrl.protocol
    );
  } catch {
    return false;
  }
}

function isValidUnlockAfterDays(unlockAfterDays: number | null): boolean {
  return (
    unlockAfterDays === null ||
    (Number.isInteger(unlockAfterDays) &&
      unlockAfterDays >= COURSE_MODULE_UNLOCK_AFTER_DAYS.min &&
      unlockAfterDays <= COURSE_MODULE_UNLOCK_AFTER_DAYS.max)
  );
}

function isValidLessonTitle(title: string): boolean {
  return title.length > 0 && title.length <= COURSE_LESSON_TITLE.maxLength;
}

function isValidLessonDescription(description: string): boolean {
  return normalizeText(description).length <= COURSE_LESSON_DESCRIPTION.maxLength;
}

const PARSED_VIDEO_KIND = {
  invalid: "invalid",
  ok: "ok",
} as const;

type ParsedVideoOrError =
  | { kind: typeof PARSED_VIDEO_KIND.ok; value: ParsedExternalVideo }
  | { kind: typeof PARSED_VIDEO_KIND.invalid };

function safeParseVideo(rawInput: string): ParsedVideoOrError {
  try {
    return { kind: PARSED_VIDEO_KIND.ok, value: parseExternalVideoUrl(rawInput) };
  } catch (error) {
    if (error instanceof InvalidVideoUrlError) {
      return { kind: PARSED_VIDEO_KIND.invalid };
    }
    throw error;
  }
}

export function getTribeCourses({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (query: GetTribeCoursesQuery): Promise<CourseTreeResult> =>
    courseRepository.getTreeByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function getEditableTribeCourses({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (query: GetTribeCoursesQuery): Promise<CourseTreeResult> =>
    courseRepository.getEditableTreeByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function createCourse({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (
    command: CreateCourseCommand
  ): Promise<CourseCreationResult> => {
    const title = normalizeText(command.title);
    const description = normalizeOptionalText(command.description);
    const coverImageUrl = normalizeOptionalText(command.coverImageUrl);
    const accessRequirement =
      command.accessRequirement === undefined
        ? COURSE_ACCESS_REQUIREMENT.membership
        : parseCourseAccessRequirement(command.accessRequirement);

    if (
      !isValidCourseTitle(title) ||
      !isValidCourseDescription(command.description) ||
      !isValidCoverImageUrl(coverImageUrl) ||
      accessRequirement === null
    ) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    return courseRepository.createCourse({
      accessRequirement,
      coverImageUrl,
      description,
      sortOrder: command.sortOrder,
      title,
      tribeSlug: normalizeText(command.tribeSlug),
    });
  };
}

export function updateCourse({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (command: UpdateCourseCommand): Promise<CourseUpdateResult> => {
    const title = normalizeText(command.title);
    const description = normalizeOptionalText(command.description);
    const coverImageUrl = normalizeOptionalText(command.coverImageUrl);
    const accessRequirement =
      command.accessRequirement === undefined
        ? null
        : parseCourseAccessRequirement(command.accessRequirement);

    if (
      !isValidCourseTitle(title) ||
      !isValidCourseDescription(command.description) ||
      !isValidCoverImageUrl(coverImageUrl) ||
      (command.accessRequirement !== undefined && accessRequirement === null)
    ) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    return courseRepository.updateCourse({
      accessRequirement,
      courseId: normalizeText(command.courseId),
      coverImageUrl,
      description,
      isActive: command.isActive,
      sortOrder: command.sortOrder,
      title,
      tribeSlug: normalizeText(command.tribeSlug),
    });
  };
}

export function deleteCourse({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (
    command: DeleteCourseCommand
  ): Promise<CourseDeletionResult> =>
    courseRepository.deleteCourse({
      courseId: normalizeText(command.courseId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}

export function createCourseModule({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (
    command: CreateCourseModuleCommand
  ): Promise<CourseModuleCreationResult> => {
    const title = normalizeText(command.title);
    const courseId = normalizeText(command.courseId);

    if (
      !isValidModuleTitle(title) ||
      courseId.length === 0 ||
      !isValidUnlockAfterDays(command.unlockAfterDays)
    ) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    return courseRepository.createCourseModule({
      courseId,
      sortOrder: command.sortOrder,
      title,
      tribeSlug: normalizeText(command.tribeSlug),
      unlockAfterDays: command.unlockAfterDays,
    });
  };
}

export function updateCourseModule({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (
    command: UpdateCourseModuleCommand
  ): Promise<CourseModuleUpdateResult> => {
    const title = normalizeText(command.title);

    if (
      !isValidModuleTitle(title) ||
      !isValidUnlockAfterDays(command.unlockAfterDays)
    ) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    return courseRepository.updateCourseModule({
      courseModuleId: normalizeText(command.courseModuleId),
      isActive: command.isActive,
      sortOrder: command.sortOrder,
      title,
      tribeSlug: normalizeText(command.tribeSlug),
      unlockAfterDays: command.unlockAfterDays,
    });
  };
}

export function deleteCourseModule({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (
    command: DeleteCourseModuleCommand
  ): Promise<CourseModuleDeletionResult> =>
    courseRepository.deleteCourseModule({
      courseModuleId: normalizeText(command.courseModuleId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}

async function cleanupPreparedLessonFiles({
  files,
  lessonFileRepository,
  tribeSlug,
  userId,
}: {
  files: LessonFileAttachmentDraft[];
  lessonFileRepository?: Partial<Pick<LessonFileRepository, "deleteFile">>;
  tribeSlug: string;
  userId: string;
}): Promise<void> {
  if (!lessonFileRepository?.deleteFile || files.length === 0) {
    return;
  }

  const deleteFile = lessonFileRepository.deleteFile;

  await Promise.allSettled(
    files.map((file) =>
      deleteFile({
        fileId: file.assetId,
        tribeSlug,
        userId,
      })
    )
  );
}

export function createLesson({
  courseRepository,
  lessonFileRepository,
}: LessonMutationDependencies) {
  return async (
    command: CreateLessonCommand
  ): Promise<LessonCreationResult> => {
    const title = normalizeText(command.title);

    if (!isValidLessonTitle(title)) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    if (!isValidLessonDescription(command.description)) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    const parsedVideo = safeParseVideo(command.externalVideoUrl);
    if (parsedVideo.kind !== PARSED_VIDEO_KIND.ok) {
      return { status: COURSE_MUTATION_STATUS.invalidVideoUrl };
    }

    const normalizedFiles = normalizeLessonFileDrafts(command.files);

    if (normalizedFiles.status !== NORMALIZED_LESSON_FILES_STATUS.valid) {
      return { status: normalizedFiles.status };
    }

    const tribeSlug = normalizeText(command.tribeSlug);
    const userId = normalizeText(command.userId);
    let files = normalizedFiles.files;

    if (files.length > 0) {
      const preparedFiles = await lessonFileRepository?.prepareForAttachment({
        files,
        tribeSlug,
        userId,
      });

      if (
        !preparedFiles ||
        preparedFiles.status !== LESSON_FILE_PREPARATION_STATUS.ready
      ) {
        await cleanupPreparedLessonFiles({
          files,
          lessonFileRepository,
          tribeSlug,
          userId,
        });

        return { status: COURSE_MUTATION_STATUS.invalidFile };
      }

      files = preparedFiles.files;
    }

    try {
      const result = await courseRepository.createLesson({
        courseModuleId: normalizeText(command.courseModuleId),
        description: normalizeOptionalText(command.description),
        externalVideoId: parsedVideo.value.externalId,
        ...(files.length > 0 ? { files } : {}),
        sortOrder: command.sortOrder,
        title,
        tribeSlug,
        videoProvider: parsedVideo.value.provider,
      });

      if (result.status !== COURSE_MUTATION_STATUS.created) {
        await cleanupPreparedLessonFiles({
          files,
          lessonFileRepository,
          tribeSlug,
          userId,
        });
      }

      return result;
    } catch (error) {
      await cleanupPreparedLessonFiles({
        files,
        lessonFileRepository,
        tribeSlug,
        userId,
      });

      throw error;
    }
  };
}

export function updateLesson({
  courseRepository,
  lessonFileRepository,
}: LessonMutationDependencies) {
  return async (
    command: UpdateLessonCommand
  ): Promise<LessonUpdateResult> => {
    const title = normalizeText(command.title);

    if (!isValidLessonTitle(title)) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    if (!isValidLessonDescription(command.description)) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    const parsedVideo = safeParseVideo(command.externalVideoUrl);
    if (parsedVideo.kind !== PARSED_VIDEO_KIND.ok) {
      return { status: COURSE_MUTATION_STATUS.invalidVideoUrl };
    }

    const normalizedFiles =
      command.files === undefined
        ? undefined
        : normalizeLessonFileDrafts(command.files);

    if (
      normalizedFiles &&
      normalizedFiles.status !== NORMALIZED_LESSON_FILES_STATUS.valid
    ) {
      return { status: normalizedFiles.status };
    }

    const tribeSlug = normalizeText(command.tribeSlug);
    const userId = normalizeText(command.userId);
    const lessonId = normalizeText(command.lessonId);
    let files =
      normalizedFiles?.status === NORMALIZED_LESSON_FILES_STATUS.valid
        ? normalizedFiles.files
        : undefined;

    if (files && files.length > 0) {
      const preparedFiles = await lessonFileRepository?.prepareForAttachment({
        files,
        lessonId,
        tribeSlug,
        userId,
      });

      if (
        !preparedFiles ||
        preparedFiles.status !== LESSON_FILE_PREPARATION_STATUS.ready
      ) {
        return { status: COURSE_MUTATION_STATUS.invalidFile };
      }

      files = preparedFiles.files;
    }

    const result = await courseRepository.updateLesson({
      courseModuleId: normalizeText(command.courseModuleId),
      description: normalizeOptionalText(command.description),
      externalVideoId: parsedVideo.value.externalId,
      ...(files !== undefined ? { files } : {}),
      isActive: command.isActive,
      lessonId,
      sortOrder: command.sortOrder,
      title,
      tribeSlug,
      videoProvider: parsedVideo.value.provider,
    });

    if (
      result.status === COURSE_MUTATION_STATUS.updated &&
      command.files !== undefined
    ) {
      await lessonFileRepository?.deletePendingFiles({
        lessonId,
        tribeSlug,
        userId,
      });
    }

    return result;
  };
}

export function deleteLesson({
  courseRepository,
  lessonFileRepository,
}: LessonMutationDependencies) {
  return async (
    command: DeleteLessonCommand
  ): Promise<LessonDeletionResult> => {
    const lessonId = normalizeText(command.lessonId);
    const tribeSlug = normalizeText(command.tribeSlug);
    const result = await courseRepository.deleteLesson({
      lessonId,
      tribeSlug,
    });

    if (result.status === COURSE_MUTATION_STATUS.deleted) {
      await lessonFileRepository?.deletePendingFiles({
        lessonId,
        tribeSlug,
        userId: normalizeText(command.userId),
      });
    }

    return result;
  };
}
