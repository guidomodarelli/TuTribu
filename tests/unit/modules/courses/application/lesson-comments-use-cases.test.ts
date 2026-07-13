import {
  createLessonComment,
  deleteLessonComment,
  listLessonComments,
} from "@/src/modules/courses/application/use-cases/lesson-comments-use-cases";
import { LESSON_COMMENT_CONTENT } from "@/src/modules/courses/constants/courses";
import type { LessonCommentRepository } from "@/src/modules/courses/domain/repositories/lesson-comment-repository";

const COMMENT_FIXTURE = {
  authorId: "u1",
  authorImageUrl: null,
  authorName: "Guido",
  canDelete: true,
  content: "Muy buena lección",
  createdAt: "2026-07-12T10:00:00Z",
  id: "comment-1",
  lessonId: "l1",
};

function buildRepository(
  overrides: Partial<LessonCommentRepository> = {}
): LessonCommentRepository {
  return {
    createComment: jest.fn(async () => ({
      comment: COMMENT_FIXTURE,
      status: "created" as const,
    })),
    deleteComment: jest.fn(async () => ({ status: "deleted" as const })),
    listByLesson: jest.fn(async () => ({
      comments: [COMMENT_FIXTURE],
      status: "ok" as const,
    })),
    ...overrides,
  };
}

describe("lesson comments use cases", () => {
  it("lists comments with trimmed identifiers", async () => {
    const repository = buildRepository();
    const useCase = listLessonComments({ lessonCommentRepository: repository });

    const result = await useCase({
      lessonId: " l1 ",
      tribeSlug: " matematica-pro ",
    });

    expect(result).toEqual({ comments: [COMMENT_FIXTURE], status: "ok" });
    expect(repository.listByLesson).toHaveBeenCalledWith({
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });
  });

  it("creates a comment with trimmed content", async () => {
    const repository = buildRepository();
    const useCase = createLessonComment({
      lessonCommentRepository: repository,
    });

    await useCase({
      content: "  Muy buena lección  ",
      lessonId: " l1 ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.createComment).toHaveBeenCalledWith({
      content: "Muy buena lección",
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects blank comments", async () => {
    const repository = buildRepository();
    const useCase = createLessonComment({
      lessonCommentRepository: repository,
    });

    const result = await useCase({
      content: "   ",
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "invalid_input" });
    expect(repository.createComment).not.toHaveBeenCalled();
  });

  it("rejects comments longer than the allowed maximum", async () => {
    const repository = buildRepository();
    const useCase = createLessonComment({
      lessonCommentRepository: repository,
    });

    const result = await useCase({
      content: "a".repeat(LESSON_COMMENT_CONTENT.maxLength + 1),
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "invalid_input" });
    expect(repository.createComment).not.toHaveBeenCalled();
  });

  it("deletes a comment with trimmed identifiers", async () => {
    const repository = buildRepository();
    const useCase = deleteLessonComment({
      lessonCommentRepository: repository,
    });

    const result = await useCase({
      commentId: " comment-1 ",
      tribeSlug: " matematica-pro ",
    });

    expect(result).toEqual({ status: "deleted" });
    expect(repository.deleteComment).toHaveBeenCalledWith({
      commentId: "comment-1",
      tribeSlug: "matematica-pro",
    });
  });
});
