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
import {
  cleanupOrphanLessonFiles,
  createLessonFileDownloadUrl,
  createLessonFileUpload,
  deleteLessonFile,
} from "@/src/modules/courses/application/use-cases/lesson-files-use-cases";
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";
import type { LessonFileRepository } from "@/src/modules/courses/domain/repositories/lesson-file-repository";

type CoursesModuleDependencies = {
  courseRepository: CourseRepository;
  lessonFileRepository: LessonFileRepository;
};

export function buildCoursesModule({
  courseRepository,
  lessonFileRepository,
}: CoursesModuleDependencies) {
  return {
    useCases: {
      cleanupOrphanLessonFiles: cleanupOrphanLessonFiles({
        lessonFileRepository,
      }),
      createCourseModule: createCourseModule({ courseRepository }),
      createLesson: createLesson({ courseRepository, lessonFileRepository }),
      createLessonFileDownloadUrl: createLessonFileDownloadUrl({
        lessonFileRepository,
      }),
      createLessonFileUpload: createLessonFileUpload({ lessonFileRepository }),
      deleteCourseModule: deleteCourseModule({ courseRepository }),
      deleteLesson: deleteLesson({ courseRepository, lessonFileRepository }),
      deleteLessonFile: deleteLessonFile({ lessonFileRepository }),
      getEditableTribeCourses: getEditableTribeCourses({ courseRepository }),
      getTribeCourses: getTribeCourses({ courseRepository }),
      updateCourseModule: updateCourseModule({ courseRepository }),
      updateLesson: updateLesson({ courseRepository, lessonFileRepository }),
    },
  };
}
