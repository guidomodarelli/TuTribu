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
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";

type CoursesModuleDependencies = {
  courseRepository: CourseRepository;
};

export function buildCoursesModule({
  courseRepository,
}: CoursesModuleDependencies) {
  return {
    useCases: {
      createCourseModule: createCourseModule({ courseRepository }),
      createLesson: createLesson({ courseRepository }),
      deleteCourseModule: deleteCourseModule({ courseRepository }),
      deleteLesson: deleteLesson({ courseRepository }),
      getEditableTribeCourses: getEditableTribeCourses({ courseRepository }),
      getTribeCourses: getTribeCourses({ courseRepository }),
      updateCourseModule: updateCourseModule({ courseRepository }),
      updateLesson: updateLesson({ courseRepository }),
    },
  };
}
