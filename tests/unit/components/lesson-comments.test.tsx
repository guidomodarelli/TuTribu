import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LessonComments } from "@/components/courses/lesson-comments";
import type { LessonCommentResult } from "@/src/modules/courses/application/results/course-results";

const TRIBE_SLUG = "matematica-pro";
const LESSON_ID = "lesson-1";

const existingComment: LessonCommentResult = {
  authorId: "u1",
  authorImageUrl: null,
  authorName: "Guido",
  canDelete: true,
  content: "Muy buena lección",
  createdAt: "2026-07-12T10:00:00Z",
  id: "comment-1",
  lessonId: LESSON_ID,
};

function buildJsonResponse(body: unknown, status = 200): Response {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

describe("LessonComments", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () =>
      buildJsonResponse({ comments: [existingComment] })
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and renders the lesson comment thread", async () => {
    render(<LessonComments lessonId={LESSON_ID} tribeSlug={TRIBE_SLUG} />);

    expect(await screen.findByText("Muy buena lección")).toBeInTheDocument();
    expect(screen.getByText("Guido")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/${TRIBE_SLUG}/courses/lessons/${LESSON_ID}/comments`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("shows the empty state when the lesson has no comments", async () => {
    global.fetch = vi.fn(async () =>
      buildJsonResponse({ comments: [] })
    ) as unknown as typeof fetch;

    render(<LessonComments lessonId={LESSON_ID} tribeSlug={TRIBE_SLUG} />);

    expect(
      await screen.findByText(/Todavía no hay comentarios/)
    ).toBeInTheDocument();
  });

  it("publishes a comment and appends the server response to the thread", async () => {
    const createdComment: LessonCommentResult = {
      ...existingComment,
      content: "Nueva consulta",
      id: "comment-2",
    };
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return buildJsonResponse({ comment: createdComment }, 201);
      }
      return buildJsonResponse({ comments: [existingComment] });
    }) as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<LessonComments lessonId={LESSON_ID} tribeSlug={TRIBE_SLUG} />);
    await screen.findByText("Muy buena lección");

    await user.type(
      screen.getByPlaceholderText("Escribí un comentario"),
      "Nueva consulta"
    );
    await user.click(screen.getByRole("button", { name: "Comentar" }));

    expect(await screen.findByText("Nueva consulta")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Escribí un comentario")).toHaveValue("");
  });

  it("removes a comment after a confirmed deletion", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return buildJsonResponse({ message: "Comentario eliminado." });
      }
      return buildJsonResponse({ comments: [existingComment] });
    }) as unknown as typeof fetch;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<LessonComments lessonId={LESSON_ID} tribeSlug={TRIBE_SLUG} />);
    await screen.findByText("Muy buena lección");

    await user.click(
      screen.getByRole("button", { name: "Eliminar comentario" })
    );

    await waitFor(() => {
      expect(screen.queryByText("Muy buena lección")).not.toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tribes/${TRIBE_SLUG}/courses/comments/comment-1`,
      { method: "DELETE" }
    );
  });

  it("shows a load error state when the thread request fails", async () => {
    global.fetch = vi.fn(async () =>
      buildJsonResponse({ message: "boom" }, 500)
    ) as unknown as typeof fetch;

    render(<LessonComments lessonId={LESSON_ID} tribeSlug={TRIBE_SLUG} />);

    expect(
      await screen.findByText("No pudimos cargar los comentarios.")
    ).toBeInTheDocument();
  });
});
