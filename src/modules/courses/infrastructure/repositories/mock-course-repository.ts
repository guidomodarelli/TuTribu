import type { Course } from "@/src/modules/courses/domain/entities/course";
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";

import { courseMockDtos } from "../api/dto/course-mock-dto";
import { mapCourseDtoToEntity } from "../api/mapper";

export class MockCourseRepository implements CourseRepository {
  async listCourses(): Promise<Course[]> {
    const courses = courseMockDtos.map(mapCourseDtoToEntity);

    return courses.map((course) => ({ ...course }));
  }
}
