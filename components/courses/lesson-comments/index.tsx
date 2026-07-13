"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LESSON_COMMENT_CONTENT } from "@/src/modules/courses/constants/courses";
import type { LessonCommentResult } from "@/src/modules/courses/application/results/course-results";
import styles from "./styles.module.scss";

const COMMENTS_COPY = {
  deleteButton: "Eliminar comentario",
  deleteConfirm: "¿Eliminar este comentario?",
  deleteError: "No pudimos eliminar el comentario. Intentá de nuevo.",
  emptyState: "Todavía no hay comentarios. Sé la primera persona en comentar.",
  heading: "Comentarios",
  loadError: "No pudimos cargar los comentarios.",
  placeholder: "Escribí un comentario",
  submitButton: "Comentar",
  submitError: "No pudimos publicar el comentario. Intentá de nuevo.",
  submitSuccess: "Comentario publicado.",
} as const;

const COMMENTS_API = {
  apiTribesPrefix: "/api/tribes/",
  commentsPrefix: "/courses/comments/",
  lessonCommentsSuffix: "/comments",
  lessonsPrefix: "/courses/lessons/",
} as const;

const HTTP_METHOD = {
  delete: "DELETE",
  post: "POST",
} as const;

const HTTP_HEADER_NAME = {
  contentType: "Content-Type",
} as const;

const HTTP_CONTENT_TYPE = {
  applicationJson: "application/json",
} as const;

const LOAD_STATUS = {
  error: "error",
  loaded: "loaded",
  loading: "loading",
} as const;

const ABORT_ERROR_NAME = "AbortError";

type LoadStatus = (typeof LOAD_STATUS)[keyof typeof LOAD_STATUS];

const COMMENT_DATE_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function buildLessonCommentsApiUrl(
  tribeSlug: string,
  lessonId: string
): string {
  return `${COMMENTS_API.apiTribesPrefix}${tribeSlug}${COMMENTS_API.lessonsPrefix}${lessonId}${COMMENTS_API.lessonCommentsSuffix}`;
}

function buildCommentApiUrl(tribeSlug: string, commentId: string): string {
  return `${COMMENTS_API.apiTribesPrefix}${tribeSlug}${COMMENTS_API.commentsPrefix}${commentId}`;
}

function formatCommentDate(createdAt: string): string {
  const parsedDate = new Date(createdAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return COMMENT_DATE_FORMATTER.format(parsedDate);
}

function readCommentsFromResponse(payload: unknown): LessonCommentResult[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = (payload as { comments?: unknown }).comments;

  return Array.isArray(candidate) ? (candidate as LessonCommentResult[]) : [];
}

function readCommentFromResponse(payload: unknown): LessonCommentResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = (payload as { comment?: unknown }).comment;

  return candidate && typeof candidate === "object"
    ? (candidate as LessonCommentResult)
    : null;
}

async function readErrorMessage(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload?.message ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

type LessonCommentsProps = {
  lessonId: string;
  tribeSlug: string;
};

export function LessonComments({ lessonId, tribeSlug }: LessonCommentsProps) {
  const [comments, setComments] = useState<LessonCommentResult[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(LOAD_STATUS.loading);
  const [draftContent, setDraftContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingCommentIds, setDeletingCommentIds] = useState<Set<string>>(
    () => new Set()
  );

  // The parent remounts this component per lesson (keyed by lesson id), so a
  // single fetch per mount starting from the initial `loading` state covers
  // every lesson switch.
  useEffect(() => {
    const abortController = new AbortController();

    fetch(buildLessonCommentsApiUrl(tribeSlug, lessonId), {
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          setLoadStatus(LOAD_STATUS.error);
          return;
        }

        const payload = await response.json().catch(() => null);
        setComments(readCommentsFromResponse(payload));
        setLoadStatus(LOAD_STATUS.loaded);
      })
      .catch((error: unknown) => {
        // Aborted requests are the expected cleanup path when the viewer
        // switches lessons; anything else surfaces as a load error state.
        if (error instanceof DOMException && error.name === ABORT_ERROR_NAME) {
          return;
        }

        setLoadStatus(LOAD_STATUS.error);
      });

    return () => abortController.abort();
  }, [lessonId, tribeSlug]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const content = draftContent.trim();

    if (content.length === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        buildLessonCommentsApiUrl(tribeSlug, lessonId),
        {
          body: JSON.stringify({ content }),
          headers: {
            [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
          },
          method: HTTP_METHOD.post,
        }
      );

      if (!response.ok) {
        toast.error(
          await readErrorMessage(response, COMMENTS_COPY.submitError)
        );
        return;
      }

      const payload = await response.json().catch(() => null);
      const createdComment = readCommentFromResponse(payload);

      if (createdComment) {
        setComments((current) => [...current, createdComment]);
      }

      setDraftContent("");
      toast.success(COMMENTS_COPY.submitSuccess);
    } catch {
      toast.error(COMMENTS_COPY.submitError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm(COMMENTS_COPY.deleteConfirm)) {
      return;
    }

    setDeletingCommentIds((current) => {
      const next = new Set(current);
      next.add(commentId);
      return next;
    });

    try {
      const response = await fetch(buildCommentApiUrl(tribeSlug, commentId), {
        method: HTTP_METHOD.delete,
      });

      if (!response.ok) {
        toast.error(await readErrorMessage(response, COMMENTS_COPY.deleteError));
        return;
      }

      setComments((current) =>
        current.filter((comment) => comment.id !== commentId)
      );
    } catch {
      toast.error(COMMENTS_COPY.deleteError);
    } finally {
      setDeletingCommentIds((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    }
  };

  return (
    <section
      aria-label={COMMENTS_COPY.heading}
      className={styles.LessonComments}
    >
      <h3 className={styles.LessonComments__heading}>
        {COMMENTS_COPY.heading}
      </h3>

      <form className={styles.LessonComments__form} onSubmit={handleSubmit}>
        <textarea
          className={styles.LessonComments__input}
          maxLength={LESSON_COMMENT_CONTENT.maxLength}
          onChange={(event) => setDraftContent(event.target.value)}
          placeholder={COMMENTS_COPY.placeholder}
          rows={2}
          value={draftContent}
        />
        <Button
          disabled={isSubmitting || draftContent.trim().length === 0}
          type="submit"
        >
          {COMMENTS_COPY.submitButton}
        </Button>
      </form>

      {loadStatus === LOAD_STATUS.error ? (
        <p className={styles.LessonComments__errorMessage}>
          {COMMENTS_COPY.loadError}
        </p>
      ) : null}

      {loadStatus === LOAD_STATUS.loaded && comments.length === 0 ? (
        <p className={styles.LessonComments__emptyState}>
          {COMMENTS_COPY.emptyState}
        </p>
      ) : null}

      <ul className={styles.LessonComments__list}>
        {comments.map((comment) => (
          <li className={styles.LessonComments__item} key={comment.id}>
            <div className={styles.LessonComments__itemHeader}>
              <Avatar size="sm">
                <AvatarImage src={comment.authorImageUrl} />
                <AvatarFallback>
                  {comment.authorName.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className={styles.LessonComments__authorName}>
                {comment.authorName}
              </span>
              <span className={styles.LessonComments__date}>
                {formatCommentDate(comment.createdAt)}
              </span>
              {comment.canDelete ? (
                <button
                  aria-label={COMMENTS_COPY.deleteButton}
                  className={styles.LessonComments__deleteButton}
                  disabled={deletingCommentIds.has(comment.id)}
                  onClick={() => handleDelete(comment.id)}
                  type="button"
                >
                  <Trash2 aria-hidden />
                </button>
              ) : null}
            </div>
            <p className={styles.LessonComments__content}>{comment.content}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
