import { ListCoursesUseCase } from "@/src/modules/courses/application/use-cases/list-courses-use-case";
import { resolveBackendBaseUrl } from "@/src/modules/shared/infrastructure/backend/backend-base-url";

import { HttpCourseRepository } from "../repositories/http-course-repository";
import { MockCourseRepository } from "../repositories/mock-course-repository";

export function createListCoursesUseCase(): ListCoursesUseCase {
  const backendBaseUrl = resolveBackendBaseUrl();

  if (backendBaseUrl) {
    return new ListCoursesUseCase(new HttpCourseRepository(backendBaseUrl));
  }

  return new ListCoursesUseCase(new MockCourseRepository());
}
