import type { CourseRepository } from "../../domain/repositories/course-repository";
import type { CourseSummaryResult } from "../results/course-summary-result";

export class ListCoursesUseCase {
  constructor(private readonly courseRepository: CourseRepository) {}

  async execute(): Promise<CourseSummaryResult[]> {
    const courses = await this.courseRepository.listCourses();

    return courses.map((course) => ({ ...course }));
  }
}
