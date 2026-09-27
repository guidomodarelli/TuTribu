"use client";

import { RotateCwIcon, Trash2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { toast, Avatar, AvatarFallback, AvatarImage, Button, AnimatedListItem } from "beez-ui";

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
  loading: "Cargando comentarios…",
  placeholder: "Escribí un comentario",
  retryButton: "Reintentar",
  submitButton: "Comentar",
  submittingButton: "Publicando…",
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

/** Key that, combined with Ctrl or Cmd, publishes the draft from the textarea. */
const SUBMIT_SHORTCUT_KEY = "Enter";

/** Prefix of the per-lesson id that ties the visually hidden label to the textarea. */
const COMMENT_INPUT_ID_PREFIX = "lesson-comments-input-";

const COMMENTS_ACCESSIBILITY = {
  alertRole: "alert",
  statusRole: "status",
} as const;

const COMMENTS_RETRY_BUTTON = {
  size: "sm",
  type: "button",
  variant: "outline",
} as const;

type LoadStatus = (typeof LOAD_STATUS)[keyof typeof LOAD_STATUS];

const COMMENT_DATE_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

/**
 * Builds the endpoint that lists and creates comments of one lesson.
 *
 * @param tribeSlug - Tribe slug.
 * @param lessonId - Lesson identifier.
 * @returns Relative endpoint path.
 */
function buildLessonCommentsApiUrl(
  tribeSlug: string,
  lessonId: string
): string {
  return `${COMMENTS_API.apiTribesPrefix}${tribeSlug}${COMMENTS_API.lessonsPrefix}${lessonId}${COMMENTS_API.lessonCommentsSuffix}`;
}

/**
 * Builds the endpoint of a single comment.
 *
 * @param tribeSlug - Tribe slug.
 * @param commentId - Comment identifier.
 * @returns Relative endpoint path.
 */
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

/**
 * Lesson comment thread: loads the comments on mount, publishes new ones and
 * deletes the viewer's own, animating each insertion and removal.
 *
 * @param props - Lesson and tribe identifiers.
 * @returns Comments section for the selected lesson.
 */
export function LessonComments({ lessonId, tribeSlug }: LessonCommentsProps) {
  const [comments, setComments] = useState<LessonCommentResult[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(LOAD_STATUS.loading);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [draftContent, setDraftContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Guards against a second submit (double click, Ctrl+Enter) landing before
  // the disabled state renders.
  const isSubmittingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputId = COMMENT_INPUT_ID_PREFIX + lessonId;
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
  }, [lessonId, tribeSlug, loadAttempt]);

  const handleRetryLoad = () => {
    setLoadStatus(LOAD_STATUS.loading);
    setLoadAttempt((currentAttempt) => currentAttempt + 1);
  };

  const submitDraft = async () => {
    const content = draftContent.trim();

    if (content.length === 0 || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
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
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitDraft();
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === SUBMIT_SHORTCUT_KEY &&
      (event.metaKey || event.ctrlKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submitDraft();
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
      // The focused delete button leaves with its comment; keep focus in the thread.
      headingRef.current?.focus();
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
      <h3
        className={styles.LessonComments__heading}
        ref={headingRef}
        tabIndex={-1}
      >
        {COMMENTS_COPY.heading}
      </h3>

      <form className={styles.LessonComments__form} onSubmit={handleSubmit}>
        <label className={styles.LessonComments__label} htmlFor={inputId}>
          {COMMENTS_COPY.placeholder}
        </label>
        <textarea
          className={styles.LessonComments__input}
          id={inputId}
          maxLength={LESSON_COMMENT_CONTENT.maxLength}
          onChange={(event) => setDraftContent(event.target.value)}
          onKeyDown={handleDraftKeyDown}
          placeholder={COMMENTS_COPY.placeholder}
          rows={2}
          value={draftContent}
        />
        <Button
          aria-busy={isSubmitting || undefined}
          disabled={isSubmitting || draftContent.trim().length === 0}
          type="submit"
        >
          {isSubmitting
            ? COMMENTS_COPY.submittingButton
            : COMMENTS_COPY.submitButton}
        </Button>
      </form>

      {loadStatus === LOAD_STATUS.loading ? (
        <p
          className={styles.LessonComments__loading}
          role={COMMENTS_ACCESSIBILITY.statusRole}
        >
          {COMMENTS_COPY.loading}
        </p>
      ) : null}

      {loadStatus === LOAD_STATUS.error ? (
        <div
          className={styles.LessonComments__error}
          role={COMMENTS_ACCESSIBILITY.alertRole}
        >
          <p className={styles.LessonComments__errorMessage}>
            {COMMENTS_COPY.loadError}
          </p>
          <Button
            onClick={handleRetryLoad}
            size={COMMENTS_RETRY_BUTTON.size}
            type={COMMENTS_RETRY_BUTTON.type}
            variant={COMMENTS_RETRY_BUTTON.variant}
          >
            <RotateCwIcon aria-hidden />
            {COMMENTS_COPY.retryButton}
          </Button>
        </div>
      ) : null}

      {loadStatus === LOAD_STATUS.loaded && comments.length === 0 ? (
        <p className={styles.LessonComments__emptyState}>
          {COMMENTS_COPY.emptyState}
        </p>
      ) : null}

      <ul className={styles.LessonComments__list}>
        <AnimatePresence initial={false}>
          {comments.map((comment) => (
            <AnimatedListItem
              className={styles.LessonComments__item}
              key={comment.id}
            >
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
            </AnimatedListItem>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
