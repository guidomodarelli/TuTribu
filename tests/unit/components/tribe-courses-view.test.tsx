import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { TribeCoursesView } from "@/components/courses/tribe-courses-view";
import type { CourseWithModulesResult } from "@/src/modules/courses/application/results/course-results";

const TRIBE_SLUG = "matematica-pro";
/** Rendered once the lesson comments request settles, so the test ends after that state update. */
const LESSON_COMMENTS_EMPTY_STATE =
  "Todavía no hay comentarios. Sé la primera persona en comentar.";

function buildCourse(
  overrides: Partial<CourseWithModulesResult> = {}
): CourseWithModulesResult {
  return {
    coverImageUrl: null,
    description: null,
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
            completed: false,
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
            completed: true,
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

function buildJsonResponse(body: unknown): Response {
  return {
    json: async () => body,
    ok: true,
    status: 200,
  } as Response;
}

describe("TribeCoursesView", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () =>
      buildJsonResponse({ comments: [] })
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the management link when a course manager sees an empty course", () => {
    render(
      <TribeCoursesView
        course={buildCourse({ modules: [] })}
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

  it("hides the management link when a regular member sees an empty course", () => {
    render(
      <TribeCoursesView
        course={buildCourse({ modules: [] })}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    expect(screen.queryByRole("link", { name: /Gestionar/ })).toBeNull();
  });

  it("keeps lesson links shareable while selecting them client-side without navigating", async () => {
    const user = userEvent.setup();
    const pushStateSpy = vi.spyOn(window.history, "pushState");

    render(
      <TribeCoursesView
        course={buildCourse()}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    // Lessons render as real, shareable links carrying `curso` and `leccion`.
    const secondLessonLink = screen.getByRole("link", {
      name: /Segunda clase/,
    });
    expect(secondLessonLink).toHaveAttribute(
      "href",
      `/${TRIBE_SLUG}/cursos?curso=course-1&leccion=lesson-2`
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
      `/${TRIBE_SLUG}/cursos?curso=course-1&leccion=lesson-2`
    );

    pushStateSpy.mockRestore();
  });

  it("resumes from the last viewed lesson when no lesson is selected", async () => {
    render(
      <TribeCoursesView
        course={buildCourse({ lastViewedLessonId: "lesson-2" })}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Segunda clase" })
    ).toBeInTheDocument();
    expect(await screen.findByText(LESSON_COMMENTS_EMPTY_STATE)).toBeInTheDocument();
  });

  it("records the opened lesson so the next visit can resume", async () => {
    render(
      <TribeCoursesView
        course={buildCourse()}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tribes/${TRIBE_SLUG}/courses/course-1/last-lesson`,
        expect.objectContaining({
          body: JSON.stringify({ lessonId: "lesson-1" }),
          method: "PUT",
        })
      );
    });
  });

  it("navigates with the next and previous lesson buttons", async () => {
    const user = userEvent.setup();

    render(
      <TribeCoursesView
        course={buildCourse()}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    expect(
      screen.queryByRole("button", { name: /Lección anterior/ })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Siguiente lección/ })
    );

    expect(
      screen.getByRole("heading", { name: "Segunda clase" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Siguiente lección/ })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Lección anterior/ })
    );

    expect(
      screen.getByRole("heading", { name: "Primera clase" })
    ).toBeInTheDocument();
  });

  it("toggles the lesson completion through the completion endpoint", async () => {
    const user = userEvent.setup();

    render(
      <TribeCoursesView
        course={buildCourse()}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Marcar como completada" })
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tribes/${TRIBE_SLUG}/courses/lessons/lesson-1/completion`,
        expect.objectContaining({
          body: JSON.stringify({ completed: true }),
          method: "PUT",
        })
      );
    });

    expect(
      screen.getByRole("button", { name: "Marcar como no completada" })
    ).toBeInTheDocument();
  });

  it("reverts the optimistic completion when the endpoint fails", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/completion")) {
        return { json: async () => ({}), ok: false, status: 500 } as Response;
      }
      return buildJsonResponse({ comments: [] });
    }) as unknown as typeof fetch;

    render(
      <TribeCoursesView
        course={buildCourse()}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Marcar como completada" })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Marcar como completada" })
      ).toBeInTheDocument();
    });
  });

  it("shows drip-locked modules with their unlock date and hides their lessons", () => {
    const lockedCourse = buildCourse({
      modules: [
        {
          courseId: "course-1",
          id: "module-locked",
          isActive: true,
          lessons: [],
          sortOrder: 0,
          title: "Módulo avanzado",
          unlockAfterDays: 14,
          viewerAccess: {
            isLocked: true,
            unlocksAt: "2026-07-20T00:00:00Z",
          },
        },
      ],
    });

    render(
      <TribeCoursesView
        course={lockedCourse}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    expect(screen.getByText("Módulo avanzado")).toBeInTheDocument();
    expect(
      screen.getByText(/Se desbloquea el 20 de julio de 2026/)
    ).toBeInTheDocument();
  });

  it("marks completed lessons with a check in the sidebar", async () => {
    render(
      <TribeCoursesView
        course={buildCourse()}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    const completedMarks = screen.getAllByLabelText("Completada");
    expect(completedMarks).toHaveLength(1);
    expect(screen.getByText("50% completado")).toBeInTheDocument();
    expect(await screen.findByText(LESSON_COMMENTS_EMPTY_STATE)).toBeInTheDocument();
  });

  it("updates the named course progress bar when a lesson is completed", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () =>
      buildJsonResponse({ completed: true })
    ) as unknown as typeof fetch;

    render(
      <TribeCoursesView
        course={buildCourse()}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    const progressBar = screen.getByRole("progressbar", {
      name: "Progreso del curso",
    });
    expect(progressBar).toHaveAttribute("aria-valuenow", "50");

    await user.click(
      screen.getByRole("button", { name: "Marcar como completada" })
    );

    expect(progressBar).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("100% completado")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("img", { name: "Completada" })).toHaveLength(2)
    );
  });

  it("brings the lesson into view when it was scrolled past, as on phones where the sidebar sits below", async () => {
    const user = userEvent.setup();
    const scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView");

    render(
      <TribeCoursesView
        course={buildCourse()}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    const lessonArticle = screen
      .getByRole("heading", { name: "Primera clase" })
      .closest("article");
    // jsdom has no layout: place the article above the viewport, as after
    // scrolling down to the sidebar on a phone.
    vi.spyOn(lessonArticle as HTMLElement, "getBoundingClientRect").mockReturnValue(
      { top: -480 } as DOMRect
    );

    await user.click(screen.getByRole("link", { name: /Segunda clase/ }));

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewSpy.mock.contexts[0]).toBe(lessonArticle);
    // The test environment reports reduced motion, so the jump is instant.
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });

  it("does not scroll when the lesson top is already visible", async () => {
    const user = userEvent.setup();
    const scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView");

    render(
      <TribeCoursesView
        course={buildCourse()}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    await user.click(screen.getByRole("link", { name: /Segunda clase/ }));

    expect(
      screen.getByRole("heading", { name: "Segunda clase" })
    ).toBeInTheDocument();
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it("hydrates the sidebar management link without recoverable errors", async () => {
    const recoverableErrors: unknown[] = [];
    const container = document.createElement("div");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(function () {});
    let consoleErrorCalls: unknown[][] = [];

    try {
      const view = (
        <TribeCoursesView
          course={buildCourse()}
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
