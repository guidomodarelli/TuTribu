import { act } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { TribeCoursesView } from "@/components/courses/tribe-courses-view";
import type { CourseModuleWithLessonsResult } from "@/src/modules/courses/application/results/course-results";

const TRIBE_SLUG = "matematica-pro";
const courseModules: CourseModuleWithLessonsResult[] = [
  {
    id: "module-1",
    isActive: true,
    lessons: [
      {
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
  },
];

describe("TribeCoursesView", () => {
  it("shows the management link when a course manager sees an empty course list", () => {
    render(
      <TribeCoursesView
        modules={[]}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: true }}
      />
    );

    expect(screen.getByRole("link", { name: /Gestionar/ })).toHaveAttribute(
      "href",
      `/${TRIBE_SLUG}/cursos/gestionar`
    );
  });

  it("hides the management link when a regular member sees an empty course list", () => {
    render(
      <TribeCoursesView
        modules={[]}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    expect(screen.queryByRole("link", { name: /Gestionar/ })).toBeNull();
  });

  it("keeps lesson links shareable while selecting them client-side without navigating", async () => {
    const user = userEvent.setup();
    const pushStateSpy = jest.spyOn(window.history, "pushState");

    render(
      <TribeCoursesView
        modules={courseModules}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    // Lessons render as real, shareable links carrying the `leccion` query.
    const secondLessonLink = screen.getByRole("link", {
      name: /Segunda clase/,
    });
    expect(secondLessonLink).toHaveAttribute(
      "href",
      `/${TRIBE_SLUG}/cursos?leccion=lesson-2`
    );

    // The first lesson is shown by default.
    expect(
      screen.getByRole("heading", { name: "Primera clase" })
    ).toBeInTheDocument();

    await user.click(secondLessonLink);

    // Selecting updates the view and the URL without a server navigation.
    expect(
      screen.getByRole("heading", { name: "Segunda clase" })
    ).toBeInTheDocument();
    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      "",
      `/${TRIBE_SLUG}/cursos?leccion=lesson-2`
    );

    pushStateSpy.mockRestore();
  });

  it("hydrates the sidebar management link without recoverable errors", async () => {
    const recoverableErrors: unknown[] = [];
    const container = document.createElement("div");
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let consoleErrorCalls: unknown[][] = [];

    try {
      const view = (
        <TribeCoursesView
          modules={courseModules}
          selectedLessonId={null}
          tribeSlug={TRIBE_SLUG}
          viewerPermissions={{ canManageCourses: true }}
        />
      );
      container.innerHTML = renderToString(view);

      let root: ReturnType<typeof hydrateRoot> | null = null;

      await act(async () => {
        root = hydrateRoot(container, view, {
          onRecoverableError: (error) => {
            recoverableErrors.push(error);
          },
        });
        await Promise.resolve();
      });

      await act(async () => {
        root?.unmount();
      });
      consoleErrorCalls = consoleErrorSpy.mock.calls;
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(recoverableErrors).toEqual([]);
    expect(consoleErrorCalls).toEqual([]);
  });
});
