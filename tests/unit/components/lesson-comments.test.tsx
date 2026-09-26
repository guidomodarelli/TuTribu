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

  it("announces the loading state until the thread arrives", async () => {
    render(<LessonComments lessonId={LESSON_ID} tribeSlug={TRIBE_SLUG} />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando comentarios…");
    expect(await screen.findByText("Muy buena lección")).toBeInTheDocument();
    expect(screen.queryByText("Cargando comentarios…")).not.toBeInTheDocument();
  });

  it("labels the comment box for assistive technology", async () => {
    render(<LessonComments lessonId={LESSON_ID} tribeSlug={TRIBE_SLUG} />);
    await screen.findByText("Muy buena lección");

    expect(
      screen.getByRole("textbox", { name: "Escribí un comentario" })
    ).toBeInTheDocument();
  });

  it("publishes with Ctrl+Enter and ignores repeated submits while the request is in flight", async () => {
    let resolveCreate: (response: Response) => void = () => undefined;
    const createdComment: LessonCommentResult = {
      ...existingComment,
      content: "Atajo de teclado",
      id: "comment-3",
    };
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveCreate = resolve;
        });
      }
      return Promise.resolve(buildJsonResponse({ comments: [existingComment] }));
    }) as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<LessonComments lessonId={LESSON_ID} tribeSlug={TRIBE_SLUG} />);
    await screen.findByText("Muy buena lección");

    const commentBox = screen.getByRole("textbox", {
      name: "Escribí un comentario",
    });
    await user.type(commentBox, "Atajo de teclado");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(
      screen.getByRole("button", { name: "Publicando…" })
    ).toBeDisabled();

    resolveCreate(buildJsonResponse({ comment: createdComment }, 201));

    expect(await screen.findByText("Atajo de teclado")).toBeInTheDocument();
    const postCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(([, init]) => init?.method === "POST");
    expect(postCalls).toHaveLength(1);
  });

  it("keeps focus inside the thread after deleting a comment", async () => {
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

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Comentarios" })).toHaveFocus()
    );
  });

  it("retries loading the thread after a failure", async () => {
    let requestCount = 0;
    global.fetch = vi.fn(async () => {
      requestCount += 1;
      return requestCount === 1
        ? buildJsonResponse({ message: "boom" }, 500)
        : buildJsonResponse({ comments: [existingComment] });
    }) as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<LessonComments lessonId={LESSON_ID} tribeSlug={TRIBE_SLUG} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar los comentarios."
    );

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Muy buena lección")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
