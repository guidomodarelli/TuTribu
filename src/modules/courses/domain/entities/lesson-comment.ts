export type LessonComment = {
  authorId: string;
  authorImageUrl: string | null;
  authorName: string;
  /** Whether the current viewer may delete this comment (author or leader). */
  canDelete: boolean;
  content: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  id: string;
  lessonId: string;
};
