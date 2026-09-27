import { describe, expect, it } from "vitest";

import {
  buildCourseLessonRoute,
  buildTribeCoursesRoute,
} from "@/lib/courses/course-lesson-route";

describe("tribe courses routes", () => {
  it("builds the bare courses page when nothing is selected", () => {
    expect(buildTribeCoursesRoute("matematica-pro")).toBe("/matematica-pro/cursos");
  });

  it("keeps only the selection provided", () => {
    expect(buildTribeCoursesRoute("matematica-pro", { courseId: "course-1" })).toBe(
      "/matematica-pro/cursos?curso=course-1"
    );
  });

  it("opens a lesson inside its course", () => {
    expect(buildCourseLessonRoute("matematica-pro", "course-1", "lesson-2")).toBe(
      "/matematica-pro/cursos?curso=course-1&leccion=lesson-2"
    );
  });
});
