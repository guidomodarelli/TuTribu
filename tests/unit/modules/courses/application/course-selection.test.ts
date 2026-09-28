import { describe, it, expect } from "vitest";

import { resolveSelectedCourse } from "@/src/modules/courses/application/course-selection";
import type { CourseWithModulesResult } from "@/src/modules/courses/application/results/course-results";

function buildCourse(courseId: string, lessonIds: string[]): CourseWithModulesResult {
  const moduleId = `${courseId}-module`;

  return {
    accessRequirement: "membership",
    coverImageUrl: null,
    description: null,
    id: courseId,
    isActive: true,
    lastViewedLessonId: null,
    viewerAccess: { completedLessonCount: 0, status: "available" },
    modules: [
      {
        courseId,
        id: moduleId,
        isActive: true,
        lessons: lessonIds.map((lessonId, lessonIndex) => ({
          completed: false,
          courseModuleId: moduleId,
          description: null,
          externalVideoId: `${lessonId}-video`,
          id: lessonId,
          isActive: true,
          sortOrder: lessonIndex,
          title: lessonId,
          videoProvider: "youtube" as const,
        })),
        sortOrder: 0,
        title: "Módulo",
        unlockAfterDays: null,
        viewerAccess: { isLocked: false, unlocksAt: null },
      },
    ],
    sortOrder: 0,
    title: courseId,
  };
}

const COURSES = [
  buildCourse("course-1", ["lesson-1"]),
  buildCourse("course-2", ["lesson-2"]),
];

describe("resolveSelectedCourse", () => {
  it("opens the requested course even when the lesson belongs to another one", () => {
    expect(
      resolveSelectedCourse(COURSES, { courseId: "course-1", lessonId: "lesson-2" })?.id
    ).toBe("course-1");
  });

  it("opens the course that owns a lesson-only request", () => {
    expect(
      resolveSelectedCourse(COURSES, { courseId: null, lessonId: "lesson-2" })?.id
    ).toBe("course-2");
  });

  it("shows the catalog without a selection or for unknown courses and lessons", () => {
    expect(resolveSelectedCourse(COURSES, { courseId: null, lessonId: null })).toBeNull();
    expect(
      resolveSelectedCourse(COURSES, { courseId: "missing", lessonId: null })
    ).toBeNull();
    expect(
      resolveSelectedCourse(COURSES, { courseId: null, lessonId: "missing" })
    ).toBeNull();
  });
});
