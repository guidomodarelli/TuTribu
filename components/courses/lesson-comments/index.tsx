"use client";

import { RotateCwIcon, Trash2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
  type SubmitEvent,
} from "react";
import { toast, Avatar, Button, AnimatedListItem, Textarea } from "@golfo/ui";

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
  variant: "secondary",
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

/**
 * Reads a response body as JSON; a body that is not JSON reads as `null`.
 * @param response - Response whose body has not been consumed yet.
 * @returns The parsed payload, still unvalidated.
 */
async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
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
    const payload = (await response.json()) as { message?: string } | null;
    return payload?.message ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

type LessonCommentsProps = {
  lessonId: string;
  tribeSlug: string;
};

type SetComments = Dispatch<SetStateAction<LessonCommentResult[]>>;

/**
 * Loads the lesson comments on mount and on every retry.
 *
 * @param tribeSlug - Tribe slug used by the endpoints.
 * @param lessonId - Lesson whose comments are listed.
 * @returns The comments, their load status and the retry handler.
 */
function useLessonCommentsLoad(tribeSlug: string, lessonId: string) {
  const [comments, setComments] = useState<LessonCommentResult[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(LOAD_STATUS.loading);
  const [loadAttempt, setLoadAttempt] = useState(0);

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

        const payload = await readJsonPayload(response);
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

  return { comments, handleRetryLoad, loadStatus, setComments };
}

/**
 * Keeps the comment draft and publishes it, from the form or the shortcut.
 *
 * @param input - Endpoint identifiers and the comments setter.
 * @param input.lessonId - Lesson the comment belongs to.
 * @param input.setComments - Appends the created comment to the thread.
 * @param input.tribeSlug - Tribe slug used by the endpoints.
 * @returns The draft state and the form handlers.
 */
function useCommentDraft({
  lessonId,
  setComments,
  tribeSlug,
}: {
  lessonId: string;
  setComments: SetComments;
  tribeSlug: string;
}) {
  const [draftContent, setDraftContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Guards against a second submit (double click, Ctrl+Enter) landing before
  // the disabled state renders.
  const isSubmittingRef = useRef(false);

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

      const payload = await readJsonPayload(response);
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

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
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

  return {
    draftContent,
    handleDraftKeyDown,
    handleSubmit,
    isSubmitting,
    setDraftContent,
  };
}

/**
 * Returns a copy of the set with the id added or removed.
 *
 * @param current - Ids of the comments being deleted.
 * @param commentId - Comment whose deletion starts or ends.
 * @param isDeleting - Whether the deletion starts.
 * @returns The updated set.
 */
function toggleDeletingComment(
  current: Set<string>,
  commentId: string,
  isDeleting: boolean
): Set<string> {
  const next = new Set(current);

  if (isDeleting) {
    next.add(commentId);
  } else {
    next.delete(commentId);
  }

  return next;
}

/**
 * Deletes the viewer's own comments after confirmation and keeps focus in the
 * thread once the focused delete button leaves.
 *
 * @param input - Endpoint slug, comments setter and the heading focus target.
 * @param input.headingRef - Thread heading that receives focus after a deletion.
 * @param input.setComments - Removes the deleted comment from the thread.
 * @param input.tribeSlug - Tribe slug used by the endpoints.
 * @returns The ids being deleted and the delete handler.
 */
function useCommentDeletion({
  headingRef,
  setComments,
  tribeSlug,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  setComments: SetComments;
  tribeSlug: string;
}) {
  const [deletingCommentIds, setDeletingCommentIds] = useState<Set<string>>(
    () => new Set()
  );

  const handleDelete = async (commentId: string) => {
    if (!window.confirm(COMMENTS_COPY.deleteConfirm)) {
      return;
    }

    setDeletingCommentIds((current) => toggleDeletingComment(current, commentId, true));

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
      setDeletingCommentIds((current) => toggleDeletingComment(current, commentId, false));
    }
  };

  return { deletingCommentIds, handleDelete };
}

/**
 * Renders the loading, error and empty feedback of the thread.
 *
 * @param props - Load status, comment count and retry handler.
 * @returns The feedback for the current load status.
 */
function CommentsLoadFeedback({
  commentCount,
  loadStatus,
  onRetry,
}: {
  commentCount: number;
  loadStatus: LoadStatus;
  onRetry: () => void;
}) {
  return (
    <>
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
            onClick={onRetry}
            size={COMMENTS_RETRY_BUTTON.size}
            type={COMMENTS_RETRY_BUTTON.type}
            variant={COMMENTS_RETRY_BUTTON.variant}
          >
            <RotateCwIcon aria-hidden />
            {COMMENTS_COPY.retryButton}
          </Button>
        </div>
      ) : null}

      {loadStatus === LOAD_STATUS.loaded && commentCount === 0 ? (
        <p className={styles.LessonComments__emptyState}>
          {COMMENTS_COPY.emptyState}
        </p>
      ) : null}
    </>
  );
}

/**
 * Renders one comment with its author, date and, for its author, the delete button.
 *
 * @param props - Comment, whether it is being deleted and the delete handler.
 * @returns The comment content; the caller wraps it in the animated list item.
 */
function CommentItemContent({
  comment,
  isDeleting,
  onDelete,
}: {
  comment: LessonCommentResult;
  isDeleting: boolean;
  onDelete: (commentId: string) => Promise<void>;
}) {
  return (
    <>
      <div className={styles.LessonComments__itemHeader}>
        {/* Decorative: the author name is shown next to it. */}
        <Avatar
          aria-hidden
          name={comment.authorName}
          size="sm"
          src={comment.authorImageUrl}
        />
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
            disabled={isDeleting}
            onClick={() => onDelete(comment.id)}
            type="button"
          >
            <Trash2 aria-hidden />
          </button>
        ) : null}
      </div>
      <p className={styles.LessonComments__content}>{comment.content}</p>
    </>
  );
}

/**
 * Renders the comment form.
 *
 * @param props - Input id and the draft state from `useCommentDraft`.
 * @returns The comment form.
 */
function CommentForm({
  draft,
  inputId,
}: {
  draft: ReturnType<typeof useCommentDraft>;
  inputId: string;
}) {
  return (
    <form className={styles.LessonComments__form} onSubmit={draft.handleSubmit}>
      <Textarea
        aria-label={COMMENTS_COPY.placeholder}
        id={inputId}
        maxLength={LESSON_COMMENT_CONTENT.maxLength}
        onChange={(event) => draft.setDraftContent(event.target.value)}
        onKeyDown={draft.handleDraftKeyDown}
        placeholder={COMMENTS_COPY.placeholder}
        rows={2}
        value={draft.draftContent}
      />
      <Button
        aria-busy={draft.isSubmitting || undefined}
        disabled={draft.isSubmitting || draft.draftContent.trim().length === 0}
        type="submit"
      >
        {draft.isSubmitting
          ? COMMENTS_COPY.submittingButton
          : COMMENTS_COPY.submitButton}
      </Button>
    </form>
  );
}

/**
 * Lesson comment thread: loads the comments on mount, publishes new ones and
 * deletes the viewer's own, animating each insertion and removal.
 *
 * @param props - Lesson and tribe identifiers.
 * @returns Comments section for the selected lesson.
 */
export function LessonComments({ lessonId, tribeSlug }: LessonCommentsProps) {
  const { comments, handleRetryLoad, loadStatus, setComments } =
    useLessonCommentsLoad(tribeSlug, lessonId);
  const draft = useCommentDraft({ lessonId, setComments, tribeSlug });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputId = COMMENT_INPUT_ID_PREFIX + lessonId;
  const { deletingCommentIds, handleDelete } = useCommentDeletion({
    headingRef,
    setComments,
    tribeSlug,
  });

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

      <CommentForm draft={draft} inputId={inputId} />

      <CommentsLoadFeedback
        commentCount={comments.length}
        loadStatus={loadStatus}
        onRetry={handleRetryLoad}
      />

      <ul className={styles.LessonComments__list}>
        <AnimatePresence initial={false}>
          {comments.map((comment) => (
            <AnimatedListItem
              className={styles.LessonComments__item}
              key={comment.id}
            >
              <CommentItemContent
                comment={comment}
                isDeleting={deletingCommentIds.has(comment.id)}
                onDelete={handleDelete}
              />
            </AnimatedListItem>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
