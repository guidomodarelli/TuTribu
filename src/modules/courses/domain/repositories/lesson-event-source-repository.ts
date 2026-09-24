import type { LESSON_EVENT_SOURCE_STATUS } from "@/src/modules/courses/constants/courses";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";

/**
 * Port of the lessons created from an event recording ("Convertir en
 * lección"). The courses module only receives plain values (title,
 * description, video, and the source occurrence reference); it never reads
 * the events schema. Writes repeat `can_manage_tribe_courses` in SQL because
 * the runtime role bypasses RLS.
 */

export type LessonConversionTargetModule = {
  id: string;
  title: string;
};

/**
 * Course of the tribe where a lesson can land, with its modules in order.
 */
export type LessonConversionTargetCourse = {
  id: string;
  modules: LessonConversionTargetModule[];
  title: string;
};

export type LessonConversionTargetsLookup =
  | {
      courses: LessonConversionTargetCourse[];
      status: typeof LESSON_EVENT_SOURCE_STATUS.found;
    }
  | {
      status:
        | typeof LESSON_EVENT_SOURCE_STATUS.forbidden
        | typeof LESSON_EVENT_SOURCE_STATUS.notFound;
    };

/**
 * Lesson to create in `courseModuleId` (which must belong to `courseId`),
 * with a reference to the occurrence whose recording originated it.
 */
export type CreateLessonFromEventRecordingRepositoryCommand = {
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

/**
 * The lesson of that occurrence in that course, whether this call created
 * it or it already existed (idempotent conversion).
 */
export type LessonFromEventRecording = {
  courseId: string;
  courseModuleId: string;
  id: string;
  title: string;
};

export type LessonFromEventRecordingResult =
  | {
      lesson: LessonFromEventRecording;
      status:
        | typeof LESSON_EVENT_SOURCE_STATUS.created
        | typeof LESSON_EVENT_SOURCE_STATUS.existing;
    }
  | {
      status:
        | typeof LESSON_EVENT_SOURCE_STATUS.forbidden
        | typeof LESSON_EVENT_SOURCE_STATUS.notFound;
    };

export type LessonEventSourceRepository = {
  canManageCourses: (query: { tribeSlug: string }) => Promise<boolean>;
  createFromEventRecording: (
    command: CreateLessonFromEventRecordingRepositoryCommand
  ) => Promise<LessonFromEventRecordingResult>;
  listConversionTargets: (query: { tribeSlug: string }) => Promise<LessonConversionTargetsLookup>;
};
