import type { Course } from "../entities/course";

export interface CourseRepository {
  listCourses(): Promise<Course[]>;
}
