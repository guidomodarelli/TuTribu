import type { LessonComment } from "@/src/modules/courses/domain/entities/lesson-comment";

export type ListLessonCommentsQuery = {
  lessonId: string;
  tribeSlug: string;
};

export type CreateLessonCommentRepositoryCommand = {
  content: string;
  lessonId: string;
  tribeSlug: string;
};

export type DeleteLessonCommentRepositoryCommand = {
  commentId: string;
  tribeSlug: string;
};

export type LessonCommentResult = LessonComment;

export type LessonCommentListResult =
  | {
      comments: LessonCommentResult[];
      status: "ok";
    }
  | {
      status: "forbidden" | "not_found";
    };

export type LessonCommentCreationResult =
  | {
      comment: LessonCommentResult;
      status: "created";
    }
  | {
      status: "forbidden" | "invalid_input" | "not_found";
    };

export type LessonCommentDeletionResult = {
  status: "deleted" | "forbidden" | "not_found";
};

/**
 * Domain-owned repository port for the discussion thread under each lesson.
 */
export type LessonCommentRepository = {
  createComment: (
    command: CreateLessonCommentRepositoryCommand
  ) => Promise<LessonCommentCreationResult>;
  deleteComment: (
    command: DeleteLessonCommentRepositoryCommand
  ) => Promise<LessonCommentDeletionResult>;
  listByLesson: (
    query: ListLessonCommentsQuery
  ) => Promise<LessonCommentListResult>;
};
