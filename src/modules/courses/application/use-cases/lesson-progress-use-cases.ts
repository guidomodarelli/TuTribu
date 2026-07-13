import type {
  RecordLastViewedLessonCommand,
  SetLessonCompletionCommand,
} from "@/src/modules/courses/application/commands/course-commands";
import type {
  LastViewedLessonRecordingResult,
  LessonCompletionResult,
} from "@/src/modules/courses/application/results/course-results";
import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";

type CourseRepositoryDependencies = {
  courseRepository: Pick<
    CourseRepository,
    "recordLastViewedLesson" | "setLessonCompletion"
  >;
};

function normalizeText(value: string): string {
  return value.trim();
}

/**
 * Toggles the "completed" mark of a lesson for the current viewer. The
 * repository owns the ownership guarantee: it only writes rows for the
 * authenticated member resolved from the request context.
 */
export function setLessonCompletion({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (
    command: SetLessonCompletionCommand
  ): Promise<LessonCompletionResult> => {
    const lessonId = normalizeText(command.lessonId);

    if (lessonId.length === 0) {
      return { status: COURSE_MUTATION_STATUS.notFound };
    }

    return courseRepository.setLessonCompletion({
      completed: command.completed,
      lessonId,
      tribeSlug: normalizeText(command.tribeSlug),
    });
  };
}

/**
 * Persists the lesson the viewer last opened inside a course, so the next
 * visit resumes where they left off.
 */
export function recordLastViewedLesson({
  courseRepository,
}: CourseRepositoryDependencies) {
  return async (
    command: RecordLastViewedLessonCommand
  ): Promise<LastViewedLessonRecordingResult> => {
    const courseId = normalizeText(command.courseId);
    const lessonId = normalizeText(command.lessonId);

    if (courseId.length === 0 || lessonId.length === 0) {
      return { status: COURSE_MUTATION_STATUS.notFound };
    }

    return courseRepository.recordLastViewedLesson({
      courseId,
      lessonId,
      tribeSlug: normalizeText(command.tribeSlug),
    });
  };
}
