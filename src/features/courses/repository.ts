import { courseMocks } from "./mocks";
import type { CourseSummary } from "./types";

export async function listCourses(): Promise<CourseSummary[]> {
  return courseMocks.map((course) => ({ ...course }));
}
