import {
  createCourse,
  createCourseModule,
  createLesson,
  deleteCourse,
  deleteCourseModule,
  deleteLesson,
  getEditableTribeCourses,
  getTribeCourses,
  updateCourse,
  updateCourseModule,
  updateLesson,
} from "@/src/modules/courses/application/use-cases/manage-tribe-courses-use-cases";
import {
  createLessonComment,
  deleteLessonComment,
  listLessonComments,
} from "@/src/modules/courses/application/use-cases/lesson-comments-use-cases";
import {
  recordLastViewedLesson,
  setLessonCompletion,
} from "@/src/modules/courses/application/use-cases/lesson-progress-use-cases";
import {
  cleanupOrphanLessonFiles,
  createLessonFileDownloadUrl,
  createLessonFileUpload,
  deleteLessonFile,
} from "@/src/modules/courses/application/use-cases/lesson-files-use-cases";
import {
  canManageTribeCourses,
  createLessonFromEventRecording,
  listLessonConversionTargets,
} from "@/src/modules/courses/application/use-cases/lesson-event-source-use-cases";
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";
import type { LessonEventSourceRepository } from "@/src/modules/courses/domain/repositories/lesson-event-source-repository";
import type { LessonCommentRepository } from "@/src/modules/courses/domain/repositories/lesson-comment-repository";
import type { LessonFileRepository } from "@/src/modules/courses/domain/repositories/lesson-file-repository";

type CoursesModuleDependencies = {
  courseRepository: CourseRepository;
  lessonCommentRepository: LessonCommentRepository;
  lessonEventSourceRepository: LessonEventSourceRepository;
  lessonFileRepository: LessonFileRepository;
};

export function buildCoursesModule({
  courseRepository,
  lessonCommentRepository,
  lessonEventSourceRepository,
  lessonFileRepository,
}: CoursesModuleDependencies) {
  return {
    useCases: {
      canManageTribeCourses: canManageTribeCourses({ lessonEventSourceRepository }),
      cleanupOrphanLessonFiles: cleanupOrphanLessonFiles({
        lessonFileRepository,
      }),
      createCourse: createCourse({ courseRepository }),
      createCourseModule: createCourseModule({ courseRepository }),
      createLesson: createLesson({ courseRepository, lessonFileRepository }),
      createLessonComment: createLessonComment({ lessonCommentRepository }),
      createLessonFromEventRecording: createLessonFromEventRecording({
        lessonEventSourceRepository,
      }),
      createLessonFileDownloadUrl: createLessonFileDownloadUrl({
        lessonFileRepository,
      }),
      createLessonFileUpload: createLessonFileUpload({ lessonFileRepository }),
      deleteCourse: deleteCourse({ courseRepository }),
      deleteCourseModule: deleteCourseModule({ courseRepository }),
      deleteLesson: deleteLesson({ courseRepository, lessonFileRepository }),
      deleteLessonComment: deleteLessonComment({ lessonCommentRepository }),
      deleteLessonFile: deleteLessonFile({ lessonFileRepository }),
      getEditableTribeCourses: getEditableTribeCourses({ courseRepository }),
      getTribeCourses: getTribeCourses({ courseRepository }),
      listLessonComments: listLessonComments({ lessonCommentRepository }),
      listLessonConversionTargets: listLessonConversionTargets({ lessonEventSourceRepository }),
      recordLastViewedLesson: recordLastViewedLesson({ courseRepository }),
      setLessonCompletion: setLessonCompletion({ courseRepository }),
      updateCourse: updateCourse({ courseRepository }),
      updateCourseModule: updateCourseModule({ courseRepository }),
      updateLesson: updateLesson({ courseRepository, lessonFileRepository }),
    },
  };
}
