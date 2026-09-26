import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeCoursesCatalogManagement } from "@/components/courses/tribe-courses-catalog-management";
import type { CourseWithModulesResult } from "@/src/modules/courses/application/results/course-results";

const TRIBE_SLUG = "matematica-pro";

function buildCourse(
  overrides: Partial<CourseWithModulesResult> = {}
): CourseWithModulesResult {
  return {
    coverImageUrl: null,
    description: null,
    id: "course-1",
    isActive: true,
    lastViewedLessonId: null,
    modules: [],
    sortOrder: 0,
    title: "Inversiones",
    ...overrides,
  };
}

function buildJsonResponse(body: unknown, status = 200): Response {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

describe("TribeCoursesCatalogManagement", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a blank title with a visible error and focuses the field", async () => {
    const user = userEvent.setup();

    render(
      <TribeCoursesCatalogManagement initialCourses={[]} tribeSlug={TRIBE_SLUG} />
    );

    await user.click(screen.getByRole("button", { name: "Nuevo curso" }));

    const titleInput = await screen.findByRole("textbox", { name: "Título" });

    expect(titleInput).toHaveFocus();

    await user.type(titleInput, "   ");
    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escribí un título para el curso."
    );
    expect(titleInput).toHaveAttribute("aria-invalid", "true");
    expect(titleInput).toHaveFocus();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("creates a course with a trimmed title and returns focus to the new course button", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () =>
      buildJsonResponse(
        {
          course: {
            coverImageUrl: null,
            description: null,
            id: "course-2",
            isActive: true,
            sortOrder: 0,
            title: "Ahorro",
          },
        },
        201
      )
    ) as unknown as typeof fetch;

    render(
      <TribeCoursesCatalogManagement initialCourses={[]} tribeSlug={TRIBE_SLUG} />
    );

    await user.click(screen.getByRole("button", { name: "Nuevo curso" }));
    await user.type(
      await screen.findByRole("textbox", { name: "Título" }),
      "  Ahorro  "
    );
    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(
      await screen.findByRole("heading", { name: "Ahorro" })
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/${TRIBE_SLUG}/courses`,
      expect.objectContaining({
        body: expect.stringContaining('"title":"Ahorro"'),
        method: "POST",
      })
    );
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Título" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Nuevo curso" })).toHaveFocus();
  });

  it("focuses the title when editing and returns focus to the edit button on cancel", async () => {
    const user = userEvent.setup();

    render(
      <TribeCoursesCatalogManagement
        initialCourses={[buildCourse()]}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const courseActions = screen.getByRole("group", {
      name: "Acciones del curso Inversiones",
    });
    await user.click(within(courseActions).getByRole("button", { name: "Editar" }));

    const titleInput = await screen.findByRole("textbox", { name: "Título" });

    await waitFor(() => expect(titleInput).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    const editButton = await screen.findByRole("button", { name: "Editar" });

    await waitFor(() => expect(editButton).toHaveFocus());
  });

  it("restores a deleted course when the server rejects the deletion", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    global.fetch = vi.fn(async () =>
      buildJsonResponse({ message: "No pudimos eliminar el curso." }, 500)
    ) as unknown as typeof fetch;

    render(
      <TribeCoursesCatalogManagement
        initialCourses={[buildCourse()]}
        tribeSlug={TRIBE_SLUG}
      />
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(
      await screen.findByRole("heading", { name: "Inversiones" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Eliminar" })).toBeEnabled()
    );
    expect(screen.getByRole("button", { name: "Nuevo curso" })).toHaveFocus();
  });
});
