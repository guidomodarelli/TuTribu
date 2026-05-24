import type {
  CreateCourseModuleCommand,
  CreateLessonCommand,
  DeleteCourseModuleCommand,
  DeleteLessonCommand,
  GetTribeCoursesQuery,
  UpdateCourseModuleCommand,
  UpdateLessonCommand,
} from "@/src/modules/courses/application/commands/course-commands";
import type {
  CourseModuleCreationResult,
  CourseModuleDeletionResult,
  CourseModuleUpdateResult,
  CourseTreeResult,
  LessonCreationResult,
  LessonDeletionResult,
  LessonUpdateResult,
} from "@/src/modules/courses/application/results/course-results";
import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";
import {
  InvalidVideoUrlError,
  parseExternalVideoUrl,
  type ParsedExternalVideo,
} from "@/src/modules/shared/domain/value-objects/external-video-url";

type CourseRepositoryDependencies = {
  courseRepository: CourseRepository;
};

const COURSE_MODULE_TITLE_MAX_LENGTH = 120;
const COURSE_LESSON_TITLE_MAX_LENGTH = 160;

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

function isValidLessonTitle(title: string): boolean {
  return title.length > 0 && title.length <= COURSE_LESSON_TITLE_MAX_LENGTH;
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

export function createCourseModule({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (
    command: CreateCourseModuleCommand
  ): Promise<CourseModuleCreationResult> => {
    const title = normalizeText(command.title);

    if (!isValidModuleTitle(title)) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    return courseRepository.createCourseModule({
      sortOrder: command.sortOrder,
      title,
      tribeSlug: normalizeText(command.tribeSlug),
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

    if (!isValidModuleTitle(title)) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    return courseRepository.updateCourseModule({
      courseModuleId: normalizeText(command.courseModuleId),
      isActive: command.isActive,
      sortOrder: command.sortOrder,
      title,
      tribeSlug: normalizeText(command.tribeSlug),
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

export function createLesson({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (
    command: CreateLessonCommand
  ): Promise<LessonCreationResult> => {
    const title = normalizeText(command.title);

    if (!isValidLessonTitle(title)) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    const parsedVideo = safeParseVideo(command.externalVideoUrl);
    if (parsedVideo.kind !== PARSED_VIDEO_KIND.ok) {
      return { status: COURSE_MUTATION_STATUS.invalidVideoUrl };
    }

    return courseRepository.createLesson({
      courseModuleId: normalizeText(command.courseModuleId),
      description: normalizeOptionalText(command.description),
      externalVideoId: parsedVideo.value.externalId,
      sortOrder: command.sortOrder,
      title,
      tribeSlug: normalizeText(command.tribeSlug),
      videoProvider: parsedVideo.value.provider,
    });
  };
}

export function updateLesson({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (command: UpdateLessonCommand): Promise<LessonUpdateResult> => {
    const title = normalizeText(command.title);

    if (!isValidLessonTitle(title)) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    const parsedVideo = safeParseVideo(command.externalVideoUrl);
    if (parsedVideo.kind !== PARSED_VIDEO_KIND.ok) {
      return { status: COURSE_MUTATION_STATUS.invalidVideoUrl };
    }

    return courseRepository.updateLesson({
      courseModuleId: normalizeText(command.courseModuleId),
      description: normalizeOptionalText(command.description),
      externalVideoId: parsedVideo.value.externalId,
      isActive: command.isActive,
      lessonId: normalizeText(command.lessonId),
      sortOrder: command.sortOrder,
      title,
      tribeSlug: normalizeText(command.tribeSlug),
      videoProvider: parsedVideo.value.provider,
    });
  };
}

export function deleteLesson({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (
    command: DeleteLessonCommand
  ): Promise<LessonDeletionResult> =>
    courseRepository.deleteLesson({
      lessonId: normalizeText(command.lessonId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
