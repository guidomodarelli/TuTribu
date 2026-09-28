import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeCoursesBrowser } from "@/components/courses/tribe-courses-browser";
import type { CourseWithModulesResult } from "@/src/modules/courses/application/results/course-results";

// Regression guard: switching between the catalog and a course must never go
// through the App Router (which would re-render the page on the server). The
// App Router is not mounted in jsdom, so its hooks are replaced by spies.
const routerSpies = vi.hoisted(() => ({
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/matematica-pro/cursos",
  useRouter: () => routerSpies,
  useSearchParams: () => new URLSearchParams(),
}));

const TRIBE_SLUG = "matematica-pro";
const CATALOG_PATH = `/${TRIBE_SLUG}/cursos`;
/** Rendered once the lesson comments request settles, so each test ends after that state update. */
const LESSON_COMMENTS_EMPTY_STATE =
  "Todavía no hay comentarios. Sé la primera persona en comentar.";

type LessonFixture = { completed: boolean; id: string; title: string };

function buildCourse(
  courseId: string,
  title: string,
  lessons: LessonFixture[],
  overrides: Partial<CourseWithModulesResult> = {}
): CourseWithModulesResult {
  const moduleId = `${courseId}-module`;

  return {
    coverImageUrl: null,
    description: null,
    id: courseId,
    isActive: true,
    lastViewedLessonId: null,
    modules: [
      {
        courseId,
        id: moduleId,
        isActive: true,
        lessons: lessons.map((lesson, lessonIndex) => ({
          completed: lesson.completed,
          courseModuleId: moduleId,
          description: null,
          externalVideoId: `${lesson.id}-video`,
          id: lesson.id,
          isActive: true,
          sortOrder: lessonIndex,
          title: lesson.title,
          videoProvider: "youtube" as const,
        })),
        sortOrder: 0,
        title: `Módulo de ${title}`,
        unlockAfterDays: null,
        viewerAccess: { isLocked: false, unlocksAt: null },
      },
    ],
    sortOrder: 0,
    title,
    ...overrides,
  };
}

function buildCourses(): CourseWithModulesResult[] {
  return [
    buildCourse("course-1", "Inversiones", [
      { completed: false, id: "lesson-1", title: "Primera clase" },
      { completed: true, id: "lesson-2", title: "Segunda clase" },
    ]),
    buildCourse("course-2", "Ahorro", [
      { completed: false, id: "lesson-3", title: "Presupuesto" },
      { completed: false, id: "lesson-4", title: "Fondo de emergencia" },
    ]),
  ];
}

function buildJsonResponse(body: unknown): Response {
  return {
    json: async () => body,
    ok: true,
    status: 200,
  } as Response;
}

function renderBrowser({
  initialCourseId = null,
  initialLessonId = null,
}: { initialCourseId?: string | null; initialLessonId?: string | null } = {}) {
  return render(
    <TribeCoursesBrowser
      courses={buildCourses()}
      initialCourseId={initialCourseId}
      initialLessonId={initialLessonId}
      tribeSlug={TRIBE_SLUG}
      viewerPermissions={{ canManageCourses: false }}
    />
  );
}

function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

/** Moves the jsdom location as a browser Back/Forward would, then notifies listeners. */
function traverseHistoryTo(url: string) {
  act(() => {
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  });
}

/**
 * Clicks a link and reports whether the page canceled the default action. The
 * listener sits on `body`, after React's root listener and before the test
 * setup that cancels every cross-document navigation on `document`.
 */
function clickAndReportPageCancel(
  link: HTMLElement,
  clickInit: MouseEventInit
): boolean {
  let wasCanceledByPage = false;
  const recordCancel = (event: Event) => {
    wasCanceledByPage = event.defaultPrevented;
  };

  document.body.addEventListener("click", recordCancel);
  try {
    fireEvent.click(link, clickInit);
  } finally {
    document.body.removeEventListener("click", recordCancel);
  }

  return wasCanceledByPage;
}

function getCourseCard(courseTitle: string): HTMLElement {
  return screen.getByRole("link", { name: new RegExp(courseTitle) });
}

describe("TribeCoursesBrowser", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", CATALOG_PATH);
    global.fetch = vi.fn(async () =>
      buildJsonResponse({ comments: [] })
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.values(routerSpies).forEach((routerSpy) => routerSpy.mockClear());
  });

  it("opens a course from the catalog and returns to it without a server navigation", async () => {
    const user = userEvent.setup();
    const pushStateSpy = vi.spyOn(window.history, "pushState");

    renderBrowser();

    const courseCard = getCourseCard("Ahorro");
    // The card stays a real link, openable in a new tab or without JavaScript.
    expect(courseCard).toHaveAttribute("href", `${CATALOG_PATH}?curso=course-2`);

    await user.click(courseCard);

    const courseHeading = screen.getByRole("heading", { name: "Ahorro" });
    expect(courseHeading).toHaveFocus();
    expect(
      screen.getByRole("heading", { name: "Presupuesto" })
    ).toBeInTheDocument();
    expect(pushStateSpy).toHaveBeenLastCalledWith(
      null,
      "",
      `${CATALOG_PATH}?curso=course-2`
    );
    expect(currentUrl()).toBe(`${CATALOG_PATH}?curso=course-2`);

    const backLink = screen.getByRole("link", { name: /Todos los cursos/ });
    expect(backLink).toHaveAttribute("href", CATALOG_PATH);

    await user.click(backLink);

    expect(screen.getByRole("heading", { name: "Cursos", level: 1 })).toHaveFocus();
    expect(getCourseCard("Inversiones")).toBeInTheDocument();
    expect(pushStateSpy).toHaveBeenLastCalledWith(null, "", CATALOG_PATH);
    expect(currentUrl()).toBe(CATALOG_PATH);
    expect(routerSpies.push).not.toHaveBeenCalled();
    expect(routerSpies.replace).not.toHaveBeenCalled();
    expect(routerSpies.refresh).not.toHaveBeenCalled();
  });

  it("clears the lesson of the previous course when opening another one", async () => {
    const user = userEvent.setup();

    renderBrowser({ initialCourseId: "course-1", initialLessonId: "lesson-2" });

    expect(
      screen.getByRole("heading", { name: "Segunda clase" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /Todos los cursos/ }));
    await user.click(getCourseCard("Ahorro"));

    expect(currentUrl()).toBe(`${CATALOG_PATH}?curso=course-2`);
    expect(
      screen.getByRole("heading", { name: "Presupuesto" })
    ).toBeInTheDocument();
    expect(await screen.findByText(LESSON_COMMENTS_EMPTY_STATE)).toBeInTheDocument();
  });

  it("follows browser Back and Forward between the catalog, courses and lessons", async () => {
    renderBrowser();

    traverseHistoryTo(`${CATALOG_PATH}?curso=course-1&leccion=lesson-2`);

    expect(screen.getByRole("heading", { name: "Inversiones" })).toHaveFocus();
    expect(
      screen.getByRole("heading", { name: "Segunda clase" })
    ).toBeInTheDocument();

    traverseHistoryTo(`${CATALOG_PATH}?curso=course-2`);

    expect(screen.getByRole("heading", { name: "Ahorro" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Presupuesto" })
    ).toBeInTheDocument();

    // Legacy lesson-only links resolve to the course that owns the lesson.
    traverseHistoryTo(`${CATALOG_PATH}?leccion=lesson-4`);

    expect(
      screen.getByRole("heading", { name: "Fondo de emergencia" })
    ).toBeInTheDocument();

    traverseHistoryTo(CATALOG_PATH);

    expect(screen.getByRole("heading", { name: "Cursos", level: 1 })).toHaveFocus();
    expect(await screen.findAllByRole("progressbar")).toHaveLength(2);
    expect(routerSpies.push).not.toHaveBeenCalled();
  });

  it("falls back to the catalog when history points to a course that is not loaded", () => {
    renderBrowser({ initialCourseId: "course-1" });

    traverseHistoryTo(`${CATALOG_PATH}?curso=missing-course`);

    expect(
      screen.getByRole("heading", { name: "Cursos", level: 1 })
    ).toBeInTheDocument();
  });

  it("ignores history entries of other pages", () => {
    renderBrowser({ initialCourseId: "course-1" });

    traverseHistoryTo(`/${TRIBE_SLUG}/ronda?curso=course-2`);

    expect(screen.getByRole("heading", { name: "Inversiones" })).toBeInTheDocument();
  });

  it("cancels the default action of plain clicks it handles in the page", () => {
    renderBrowser();

    expect(clickAndReportPageCancel(getCourseCard("Ahorro"), {})).toBe(true);
    expect(screen.getByRole("heading", { name: "Ahorro" })).toBeInTheDocument();
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Shift", { shiftKey: true }],
    ["Alt", { altKey: true }],
    ["middle button", { button: 1 }],
  ])("leaves %s clicks on a course card to the browser", (_label, clickInit) => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");

    renderBrowser();

    expect(clickAndReportPageCancel(getCourseCard("Ahorro"), clickInit)).toBe(
      false
    );
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Cursos", level: 1 })
    ).toBeInTheDocument();
  });

  it("leaves modified clicks on the back link to the browser", () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");

    renderBrowser({ initialCourseId: "course-1" });

    expect(
      clickAndReportPageCancel(
        screen.getByRole("link", { name: /Todos los cursos/ }),
        { ctrlKey: true }
      )
    ).toBe(false);
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Inversiones" })).toBeInTheDocument();
  });

  it("keeps progress and resume point consistent after switching courses", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () =>
      buildJsonResponse({ comments: [] })
    ) as unknown as typeof fetch;

    renderBrowser();

    await user.click(getCourseCard("Ahorro"));
    await user.click(
      screen.getByRole("button", { name: "Marcar como completada" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Marcar como no completada" })
      ).toBeEnabled()
    );
    await user.click(screen.getByRole("link", { name: /Fondo de emergencia/ }));

    await user.click(screen.getByRole("link", { name: /Todos los cursos/ }));

    const savingsCard = getCourseCard("Ahorro");
    expect(
      within(savingsCard).getByRole("progressbar", { name: "Progreso del curso" })
    ).toHaveAttribute("aria-valuenow", "50");
    expect(within(savingsCard).getByText("Continuar")).toBeInTheDocument();

    await user.click(savingsCard);

    // Reopening resumes on the last lesson viewed in this session, with the
    // completion recorded while the course was open.
    expect(
      screen.getByRole("heading", { name: "Fondo de emergencia" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Progreso del curso" })
    ).toHaveAttribute("aria-valuenow", "50");
    expect(await screen.findByText(LESSON_COMMENTS_EMPTY_STATE)).toBeInTheDocument();
  });

  it("restores the catalog progress when a completion fails to save", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/completion")
        ? ({ json: async () => ({}), ok: false, status: 500 } as Response)
        : buildJsonResponse({ comments: [] })
    ) as unknown as typeof fetch;

    renderBrowser({ initialCourseId: "course-2" });

    await user.click(
      screen.getByRole("button", { name: "Marcar como completada" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Marcar como completada" })
      ).toBeEnabled()
    );
    await user.click(screen.getByRole("link", { name: /Todos los cursos/ }));

    expect(
      within(getCourseCard("Ahorro")).getByRole("progressbar", {
        name: "Progreso del curso",
      })
    ).toHaveAttribute("aria-valuenow", "0");
  });
});
