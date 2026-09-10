import { vi, describe, it, expect } from "vitest";
import { PostgresLessonCommentRepository } from "@/src/modules/courses/infrastructure/repositories/postgres-lesson-comment-repository";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      return "";
    })
    .join("");
}

describe("PostgresLessonCommentRepository", () => {
  it("lists lesson comments with author data and viewer delete permission", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          comments: [
            {
              author_id: "u1",
              author_image_url: null,
              author_name: "Guido",
              can_delete: true,
              content: "Muy buena lección",
              created_at: "2026-07-12T10:00:00Z",
              id: "comment-1",
              lesson_id: "l1",
            },
          ],
          status: "ok" as const,
        },
      ],
    }); });
    const repository = new PostgresLessonCommentRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.listByLesson({
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      comments: [
        {
          authorId: "u1",
          authorImageUrl: null,
          authorName: "Guido",
          canDelete: true,
          content: "Muy buena lección",
          createdAt: "2026-07-12T10:00:00Z",
          id: "comment-1",
          lessonId: "l1",
        },
      ],
      status: "ok" as const,
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("public.can_read_tribe_courses");
    expect(sqlText).toContain("public.is_course_module_unlocked");
  });

  it("creates a comment guarded by active membership", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          author_id: "u1",
          author_image_url: null,
          author_name: "Guido",
          content: "Consulta",
          created_at: "2026-07-12T10:00:00Z",
          id: "comment-2",
          lesson_id: "l1",
          status: "created" as const,
        },
      ],
    }); });
    const repository = new PostgresLessonCommentRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.createComment({
      content: "Consulta",
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      comment: {
        authorId: "u1",
        authorImageUrl: null,
        authorName: "Guido",
        canDelete: true,
        content: "Consulta",
        createdAt: "2026-07-12T10:00:00Z",
        id: "comment-2",
        lessonId: "l1",
      },
      status: "created" as const,
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("insert into public.course_lesson_comments");
    expect(sqlText).toContain("public.is_active_tribe_member");
  });

  it("deletes a comment when the viewer is the author or a leader", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "deleted" as const }],
    }); });
    const repository = new PostgresLessonCommentRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.deleteComment({
      commentId: "comment-1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "deleted" as const });
    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("delete from public.course_lesson_comments");
    expect(sqlText).toContain("public.can_manage_tribe_courses");
  });

  it("maps a forbidden deletion status", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "forbidden" as const }],
    }); });
    const repository = new PostgresLessonCommentRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.deleteComment({
      commentId: "comment-1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "forbidden" as const });
  });
});
