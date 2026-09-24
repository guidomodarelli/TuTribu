import {
  COURSE_LESSON_DESCRIPTION,
  COURSE_LESSON_TITLE,
  LESSON_EVENT_SOURCE_STATUS,
} from "@/src/modules/courses/constants/courses";
import type {
  LessonConversionTargetsLookup,
  LessonEventSourceRepository,
  LessonFromEventRecordingResult,
} from "@/src/modules/courses/domain/repositories/lesson-event-source-repository";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * "Convertir en lección": creates a course lesson from the recording of an
 * event occurrence. The command carries everything the lesson needs (the
 * events module resolved the recording); this module only applies course
 * rules: course permissions, the target module inside the course, the
 * lesson field limits, and one lesson per occurrence and course.
 */

type LessonEventSourceDependencies = {
  lessonEventSourceRepository: LessonEventSourceRepository;
};

export type CreateLessonFromEventRecordingCommand = {
  courseId: string;
  courseModuleId: string;
  description: string | null;
  externalVideoId: string;
  sourceEventId: string;
  sourceOccurrenceStartsAt: string;
  title: string;
  tribeSlug: string;
  videoProvider: VideoProvider;
};

export type CreateLessonFromEventRecordingResult =
  | LessonFromEventRecordingResult
  | { status: typeof LESSON_EVENT_SOURCE_STATUS.invalidInput };

/**
 * Courses and modules where a manager can put the lesson.
 */
export function listLessonConversionTargets({
  lessonEventSourceRepository,
}: LessonEventSourceDependencies) {
  return (query: { tribeSlug: string }): Promise<LessonConversionTargetsLookup> =>
    lessonEventSourceRepository.listConversionTargets(query);
}

/**
 * Whether the viewer manages the tribe courses (shows "Convertir en lección").
 */
export function canManageTribeCourses({ lessonEventSourceRepository }: LessonEventSourceDependencies) {
  return (query: { tribeSlug: string }): Promise<boolean> =>
    lessonEventSourceRepository.canManageCourses(query);
}

/**
 * Creates the lesson, or returns the one that already exists for that
 * occurrence in that course (idempotent, safe under concurrent requests).
 */
export function createLessonFromEventRecording({
  lessonEventSourceRepository,
}: LessonEventSourceDependencies) {
  return async (
    command: CreateLessonFromEventRecordingCommand
  ): Promise<CreateLessonFromEventRecordingResult> => {
    const title = command.title.trim();
    const description = command.description?.trim() || null;

    if (
      title.length === 0 ||
      title.length > COURSE_LESSON_TITLE.maxLength ||
      (description?.length ?? 0) > COURSE_LESSON_DESCRIPTION.maxLength
    ) {
      return { status: LESSON_EVENT_SOURCE_STATUS.invalidInput };
    }

    return lessonEventSourceRepository.createFromEventRecording({
      ...command,
      description,
      title,
    });
  };
}
