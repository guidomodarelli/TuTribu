import type {
  CreateLessonCommentCommand,
  DeleteLessonCommentCommand,
  ListLessonCommentsQuery,
} from "@/src/modules/courses/application/commands/course-commands";
import type {
  LessonCommentCreationResult,
  LessonCommentDeletionResult,
  LessonCommentListResult,
} from "@/src/modules/courses/application/results/course-results";
import {
  COURSE_MUTATION_STATUS,
  LESSON_COMMENT_CONTENT,
} from "@/src/modules/courses/constants/courses";
import type { LessonCommentRepository } from "@/src/modules/courses/domain/repositories/lesson-comment-repository";

type LessonCommentRepositoryDependencies = {
  lessonCommentRepository: LessonCommentRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

function isValidCommentContent(content: string): boolean {
  return (
    content.length >= LESSON_COMMENT_CONTENT.minLength &&
    content.length <= LESSON_COMMENT_CONTENT.maxLength
  );
}

export function listLessonComments({
  lessonCommentRepository,
}: LessonCommentRepositoryDependencies) {
  return async (
    query: ListLessonCommentsQuery
  ): Promise<LessonCommentListResult> =>
    lessonCommentRepository.listByLesson({
      lessonId: normalizeText(query.lessonId),
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

export function createLessonComment({
  lessonCommentRepository,
}: LessonCommentRepositoryDependencies) {
  return async (
    command: CreateLessonCommentCommand
  ): Promise<LessonCommentCreationResult> => {
    const content = normalizeText(command.content);

    if (!isValidCommentContent(content)) {
      return { status: COURSE_MUTATION_STATUS.invalidInput };
    }

    return lessonCommentRepository.createComment({
      content,
      lessonId: normalizeText(command.lessonId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
  };
}

export function deleteLessonComment({
  lessonCommentRepository,
}: LessonCommentRepositoryDependencies) {
  return async (
    command: DeleteLessonCommentCommand
  ): Promise<LessonCommentDeletionResult> =>
    lessonCommentRepository.deleteComment({
      commentId: normalizeText(command.commentId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
