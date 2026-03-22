import type { Course } from "@/src/modules/courses/domain/entities/course";
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";
import {
  fetchWithResilience,
  type FetchResilienceOptions,
  type HttpFetcher,
} from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";

import { COURSES_V1_ENDPOINTS } from "../api/contracts/v1";
import { parseCoursesResponseDto } from "../api/dto/course-dto";
import { mapCourseDtoToEntity } from "../api/mapper";

export class HttpCourseRepository implements CourseRepository {
  constructor(
    private readonly backendBaseUrl: string,
    private readonly fetcher: HttpFetcher = fetch as unknown as HttpFetcher,
    private readonly resilienceOptions?: Partial<FetchResilienceOptions>
  ) {}

  async listCourses(): Promise<Course[]> {
    const response = await fetchWithResilience(
      this.fetcher,
      `${this.backendBaseUrl}${COURSES_V1_ENDPOINTS.listCourses}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      this.resilienceOptions
    );

    if (!response.ok) {
      throw new Error("Failed to fetch courses");
    }

    const payload = await response.json();
    const parsed = parseCoursesResponseDto(payload);

    return parsed.items.map(mapCourseDtoToEntity);
  }
}
