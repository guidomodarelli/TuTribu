import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { TribeCoursesCatalog } from "@/components/courses/tribe-courses-catalog";
import type { CourseWithModulesResult } from "@/src/modules/courses/application/results/course-results";

const TRIBE_SLUG = "matematica-pro";

function buildCourse(
  overrides: Partial<CourseWithModulesResult> = {}
): CourseWithModulesResult {
  return {
    coverImageUrl: null,
    description: "Aprendé a invertir desde cero.",
    id: "course-1",
    isActive: true,
    lastViewedLessonId: null,
    modules: [
      {
        courseId: "course-1",
        id: "module-1",
        isActive: true,
        lessons: [
          {
            completed: true,
            courseModuleId: "module-1",
            description: null,
            externalVideoId: "video-1",
            id: "lesson-1",
            isActive: true,
            sortOrder: 0,
            title: "Primera clase",
            videoProvider: "youtube",
          },
          {
            completed: false,
            courseModuleId: "module-1",
            description: null,
            externalVideoId: "video-2",
            id: "lesson-2",
            isActive: true,
            sortOrder: 1,
            title: "Segunda clase",
            videoProvider: "youtube",
          },
        ],
        sortOrder: 0,
        title: "Módulo inicial",
        unlockAfterDays: null,
        viewerAccess: { isLocked: false, unlocksAt: null },
      },
    ],
    sortOrder: 0,
    title: "Inversiones",
    ...overrides,
  };
}

describe("TribeCoursesCatalog", () => {
  it("links each course to its shareable URL and exposes a named progress bar", () => {
    render(
      <TribeCoursesCatalog
        courses={[buildCourse()]}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    const courseLink = screen.getByRole("link", { name: /Inversiones/ });

    expect(courseLink).toHaveAttribute(
      "href",
      "/matematica-pro/cursos?curso=course-1"
    );

    const progressBar = within(courseLink).getByRole("progressbar", {
      name: "Progreso del curso",
    });

    expect(progressBar).toHaveAttribute("aria-valuenow", "50");
    expect(within(courseLink).getByText("50% completado")).toBeInTheDocument();
    expect(within(courseLink).getByText("Continuar")).toBeInTheDocument();
    expect(within(courseLink).getByText("2 lecciones")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Gestionar" })
    ).not.toBeInTheDocument();
  });

  it("invites to start untouched courses and marks inactive ones", () => {
    const untouchedCourse = buildCourse({ isActive: false });
    untouchedCourse.modules[0].lessons[0].completed = false;

    render(
      <TribeCoursesCatalog
        courses={[untouchedCourse]}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: true }}
      />
    );

    expect(screen.getByText("Empezar")).toBeInTheDocument();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0"
    );
    expect(screen.getByRole("link", { name: "Gestionar" })).toHaveAttribute(
      "href",
      "/matematica-pro/cursos/gestionar"
    );
  });

  it("shows a quiet empty state when the tribe has no courses", () => {
    render(
      <TribeCoursesCatalog
        courses={[]}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Aún no hay cursos" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
