"use client";

import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Lock,
  Settings,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { m } from "motion/react";
import { toast, Button, PresenceSwap, formatFileSize, cn, SPRING_LAYOUT, RichTextContent } from "@golfo/ui";

import { LessonComments } from "@/components/courses/lesson-comments";
import { Link } from "@/components/navigation/link";
import { useRevealViewHeadingOnMount } from "@/hooks/use-reveal-view-heading-on-mount";
import { isInPageLinkClick } from "@/lib/plain-link-click";

import { ROUTES } from "@/src/constants/routes";
import type {
  CourseTreeViewerPermissionsResult,
  CourseWithModulesResult,
  LessonWithViewerStateResult,
} from "@/src/modules/courses/application/results/course-results";
import { getCourseProgressPercent } from "@/src/modules/courses/application/course-progress";
import {
  PLAYER_IFRAME_ALLOW,
  PLAYER_IFRAME_SANDBOX,
  buildPlayerEmbedSource,
} from "@/src/modules/shared/application/video/build-player-embed-source";
import styles from "./styles.module.scss";

const COURSE_QUERY_PARAM = "curso";
const LESSON_QUERY_PARAM = "leccion";
const ARIA_CURRENT_PAGE = "page";
const POPSTATE_EVENT = "popstate";
const HISTORY_UNUSED_TITLE = "";
const PERCENT_MAX = 100;
const PROGRESSBAR_ROLE = "progressbar";
const IMAGE_ROLE = "img";

/** Shared layout id: the active-lesson highlight glides between sidebar rows. */
const ACTIVE_LESSON_INDICATOR_LAYOUT_ID = "tribe-courses-view-active-lesson";

/** Presence keys of the sidebar lesson marker. */
const LESSON_MARKER_KEY = {
  completed: "completed",
  number: "number",
} as const;

const SCROLL_BEHAVIOR = {
  instant: "auto",
  smooth: "smooth",
} as const;
const SCROLL_BLOCK_START = "start";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** Distinguishes the lesson body key from its sibling comments key. */
const LESSON_BODY_KEY_PREFIX = "lesson-body-";

/**
 * Inline transform for the progress fill; scaling keeps the change on the
 * compositor and lets the CSS transition glide between values.
 *
 * @param progressPercent - Progress between 0 and 100.
 * @returns Style object with the horizontal scale.
 */
function buildProgressFillStyle(progressPercent: number) {
  return { transform: `scaleX(${progressPercent / PERCENT_MAX})` };
}

/**
 * Builds the shareable URL of a lesson inside the course view.
 *
 * @param tribeSlug - Tribe slug.
 * @param courseId - Course identifier.
 * @param lessonId - Lesson identifier.
 * @returns Relative page path with the course and lesson query parameters.
 */
function buildLessonHref(
  tribeSlug: string,
  courseId: string,
  lessonId: string
): string {
  return `${ROUTES.tribes.courses(tribeSlug)}?${COURSE_QUERY_PARAM}=${courseId}&${LESSON_QUERY_PARAM}=${lessonId}`;
}

const LESSON_FILES_API = {
  apiTribesPrefix: "/api/tribes/",
  completionSuffix: "/completion",
  coursesPrefix: "/courses/",
  downloadSuffix: "/download",
  lastLessonSuffix: "/last-lesson",
  lessonFilesPrefix: "/courses/lessons/files/",
  lessonsPrefix: "/courses/lessons/",
} as const;

const HTTP_METHOD = {
  put: "PUT",
} as const;

const HTTP_HEADER_NAME = {
  contentType: "Content-Type",
} as const;

const HTTP_CONTENT_TYPE = {
  applicationJson: "application/json",
} as const;

function buildLessonFileDownloadHref(
  tribeSlug: string,
  fileId: string
): string {
  return `${LESSON_FILES_API.apiTribesPrefix}${tribeSlug}${LESSON_FILES_API.lessonFilesPrefix}${fileId}${LESSON_FILES_API.downloadSuffix}`;
}

function buildLessonCompletionApiUrl(
  tribeSlug: string,
  lessonId: string
): string {
  return `${LESSON_FILES_API.apiTribesPrefix}${tribeSlug}${LESSON_FILES_API.lessonsPrefix}${lessonId}${LESSON_FILES_API.completionSuffix}`;
}

function buildLastViewedLessonApiUrl(
  tribeSlug: string,
  courseId: string
): string {
  return `${LESSON_FILES_API.apiTribesPrefix}${tribeSlug}${LESSON_FILES_API.coursesPrefix}${courseId}${LESSON_FILES_API.lastLessonSuffix}`;
}

type LessonFileResult = NonNullable<LessonWithViewerStateResult["files"]>[number];

function sortLessonFiles(files: LessonFileResult[]): LessonFileResult[] {
  return [...files].sort(
    (leftFile, rightFile) => leftFile.sortOrder - rightFile.sortOrder
  );
}

const COURSES_COPY = {
  backToCatalog: "Todos los cursos",
  completeButton: "Marcar como completada",
  completedBadge: "Completada",
  completionError: "No pudimos guardar tu progreso. Intentá de nuevo.",
  emptyDescription: "Este curso todavía no tiene lecciones cargadas.",
  emptyHeading: "Curso sin contenido",
  downloadFilePrefix: "Descargar ",
  inactiveBadge: "Inactivo",
  lessonFilesHeading: "Material de la lección",
  lessonNavigationLabel: "Navegación de lecciones",
  lockedModulePrefix: "Se desbloquea el ",
  manageCta: "Gestionar",
  nextLessonButton: "Siguiente lección",
  previousLessonButton: "Lección anterior",
  progressLabel: "Progreso del curso",
  progressSuffix: "% completado",
  selectLessonPrompt: "Elegí una lección de la barra lateral para empezar.",
  uncompleteButton: "Marcar como no completada",
} as const;

const UNLOCK_DATE_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

function formatUnlockDate(unlocksAt: string | null): string | null {
  if (!unlocksAt) {
    return null;
  }

  const parsedDate = new Date(unlocksAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return UNLOCK_DATE_FORMATTER.format(parsedDate);
}

type TribeCoursesViewProps = {
  course: CourseWithModulesResult;
  /**
   * Returns to the catalog inside the page. When provided, plain clicks on the
   * back link call it instead of following the link.
   */
  onBackToCatalog?: () => void;
  /** Reports each completion change (optimistic value and rollback) to shared state. */
  onLessonCompletionChange?: (
    courseId: string,
    lessonId: string,
    completed: boolean
  ) => void;
  /** Reports the lesson being viewed, so the resume point stays in sync. */
  onLessonViewed?: (courseId: string, lessonId: string) => void;
  /** Focuses the course heading on mount, after an in-page navigation. */
  revealHeadingOnMount?: boolean;
  selectedLessonId: string | null;
  tribeSlug: string;
  viewerPermissions: CourseTreeViewerPermissionsResult;
};

type CourseManagementLinkProps = {
  tribeSlug: string;
};

function CourseManagementLink({ tribeSlug }: CourseManagementLinkProps) {
  return (
    <Link
      className={styles.TribeCoursesView__managementLink}
      href={ROUTES.tribes.coursesManage(tribeSlug)}
    >
      <Settings aria-hidden />
      {COURSES_COPY.manageCta}
    </Link>
  );
}

function flattenVisibleLessons(
  course: CourseWithModulesResult
): LessonWithViewerStateResult[] {
  return course.modules.flatMap((courseModule) =>
    courseModule.viewerAccess.isLocked ? [] : courseModule.lessons
  );
}

function findInitialLesson(
  course: CourseWithModulesResult,
  selectedLessonId: string | null
): LessonWithViewerStateResult | null {
  const lessons = flattenVisibleLessons(course);
  const candidateIds = [selectedLessonId, course.lastViewedLessonId];

  for (const candidateId of candidateIds) {
    if (!candidateId) {
      continue;
    }

    const match = lessons.find((lesson) => lesson.id === candidateId);

    if (match) {
      return match;
    }
  }

  return lessons[0] ?? null;
}

/**
 * Returns a copy of the set with the id added or removed.
 *
 * @param current - Current ids.
 * @param id - Id to add or remove.
 * @param isIncluded - Whether the id must be in the result.
 * @returns The updated set.
 */
function toggleSetEntry(current: Set<string>, id: string, isIncluded: boolean): Set<string> {
  const next = new Set(current);

  if (isIncluded) {
    next.add(id);
  } else {
    next.delete(id);
  }

  return next;
}

/**
 * Returns a copy of the map with one entry set.
 *
 * @param current - Current completion overrides.
 * @param lessonId - Lesson whose completion is set.
 * @param completed - Completion value.
 * @returns The updated map.
 */
function withCompletionOverride(
  current: Map<string, boolean>,
  lessonId: string,
  completed: boolean
): Map<string, boolean> {
  const next = new Map(current);
  next.set(lessonId, completed);
  return next;
}

/**
 * Applies the local completion overrides to the course tree.
 *
 * @param course - Course tree from the server.
 * @param completionOverrides - Completion values changed in this view.
 * @returns The course with the overrides applied.
 */
function applyCompletionOverrides(
  course: CourseWithModulesResult,
  completionOverrides: Map<string, boolean>
): CourseWithModulesResult {
  return {
    ...course,
    modules: course.modules.map((courseModule) => ({
      ...courseModule,
      lessons: courseModule.lessons.map((lesson) => ({
        ...lesson,
        completed: completionOverrides.get(lesson.id) ?? lesson.completed,
      })),
    })),
  };
}

/**
 * Saves the viewer completion of a lesson.
 *
 * @param tribeSlug - Tribe slug.
 * @param lessonId - Lesson identifier.
 * @param completed - Completion value to save.
 * @returns The response.
 */
function putLessonCompletion(
  tribeSlug: string,
  lessonId: string,
  completed: boolean
): Promise<Response> {
  return fetch(buildLessonCompletionApiUrl(tribeSlug, lessonId), {
    body: JSON.stringify({ completed }),
    headers: {
      [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
    },
    method: HTTP_METHOD.put,
  });
}

/**
 * Brings the lesson top into view when it is scrolled past. On phones the
 * sidebar sits below the player, and long lessons push the player above the
 * fold on desktop, so the selection must visibly take effect.
 *
 * @param lessonArticle - Lesson article element.
 */
function revealLessonArticleElement(lessonArticle: HTMLElement | null) {
  if (!lessonArticle || lessonArticle.getBoundingClientRect().top >= 0) {
    return;
  }

  // Read at call time so a preference changed mid-session is honored.
  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches;

  lessonArticle.scrollIntoView({
    behavior: prefersReducedMotion
      ? SCROLL_BEHAVIOR.instant
      : SCROLL_BEHAVIOR.smooth,
    block: SCROLL_BLOCK_START,
  });
}

type LessonNavigationInput = Pick<
  TribeCoursesViewProps,
  "course" | "onBackToCatalog" | "selectedLessonId" | "tribeSlug"
>;

/**
 * Keeps the active lesson in local state, mirrored in the shareable URL
 * through the History API and in sync with Back/Forward.
 *
 * @param input - Course, initial lesson, tribe slug and the in-page back callback.
 * @returns The active lesson id, the lesson article ref and the navigation handlers.
 */
function useLessonNavigation({
  course,
  onBackToCatalog,
  selectedLessonId,
  tribeSlug,
}: LessonNavigationInput) {
  const lessonArticleRef = useRef<HTMLElement>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(
    selectedLessonId
  );

  // Keep the selection in sync with browser back/forward, which only changes
  // the `leccion` query string without a server navigation.
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveLessonId(params.get(LESSON_QUERY_PARAM));
    };

    window.addEventListener(POPSTATE_EVENT, handlePopState);
    return () => window.removeEventListener(POPSTATE_EVENT, handlePopState);
  }, []);

  const navigateToLesson = useCallback(
    (lessonId: string) => {
      setActiveLessonId(lessonId);
      window.history.pushState(
        null,
        HISTORY_UNUSED_TITLE,
        buildLessonHref(tribeSlug, course.id, lessonId)
      );
      revealLessonArticleElement(lessonArticleRef.current);
    },
    [course.id, tribeSlug]
  );

  // Select a lesson without a server round-trip: the view already holds every
  // lesson, so we update local state and reflect the shareable `leccion` query
  // through the History API instead of navigating. Modified clicks (new tab,
  // etc.) fall through to the real link so the URL stays openable on its own.
  const handleLessonSelect = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, lessonId: string) => {
      if (!isInPageLinkClick(event)) {
        return;
      }

      event.preventDefault();
      navigateToLesson(lessonId);
    },
    [navigateToLesson]
  );

  const handleBackToCatalogClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!onBackToCatalog || !isInPageLinkClick(event)) {
        return;
      }

      event.preventDefault();
      onBackToCatalog();
    },
    [onBackToCatalog]
  );

  return {
    activeLessonId,
    handleBackToCatalogClick,
    handleLessonSelect,
    lessonArticleRef,
    navigateToLesson,
  };
}

/**
 * Toggles lesson completion optimistically, reporting each change (and its
 * rollback) to the shared client state.
 *
 * @param input - Course, tribe slug and the completion change callback.
 * @returns The completion state and the toggle handler.
 */
function useLessonCompletion({
  course,
  onLessonCompletionChange,
  tribeSlug,
}: Pick<TribeCoursesViewProps, "course" | "onLessonCompletionChange" | "tribeSlug">) {
  const [completionOverrides, setCompletionOverrides] = useState<
    Map<string, boolean>
  >(() => new Map());
  const [pendingCompletionLessonIds, setPendingCompletionLessonIds] = useState<
    Set<string>
  >(() => new Set());

  const isLessonCompleted = useCallback(
    (lesson: LessonWithViewerStateResult): boolean =>
      completionOverrides.get(lesson.id) ?? lesson.completed,
    [completionOverrides]
  );

  const courseWithOverrides = useMemo<CourseWithModulesResult>(
    () => applyCompletionOverrides(course, completionOverrides),
    [completionOverrides, course]
  );

  const toggleLessonCompletion = useCallback(
    async (lesson: LessonWithViewerStateResult) => {
      if (pendingCompletionLessonIds.has(lesson.id)) {
        return;
      }

      const previousValue =
        completionOverrides.get(lesson.id) ?? lesson.completed;
      const nextValue = !previousValue;

      setPendingCompletionLessonIds((current) => toggleSetEntry(current, lesson.id, true));
      setCompletionOverrides((current) => withCompletionOverride(current, lesson.id, nextValue));
      onLessonCompletionChange?.(course.id, lesson.id, nextValue);

      // Restores the previous value locally and in the shared client state.
      const revertCompletion = () => {
        setCompletionOverrides((current) =>
          withCompletionOverride(current, lesson.id, previousValue)
        );
        onLessonCompletionChange?.(course.id, lesson.id, previousValue);
        toast.error(COURSES_COPY.completionError);
      };

      try {
        const response = await putLessonCompletion(tribeSlug, lesson.id, nextValue);

        if (!response.ok) {
          revertCompletion();
        }
      } catch {
        // A network failure is recoverable: roll back and let the viewer retry.
        revertCompletion();
      } finally {
        setPendingCompletionLessonIds((current) => toggleSetEntry(current, lesson.id, false));
      }
    },
    [
      completionOverrides,
      course.id,
      onLessonCompletionChange,
      pendingCompletionLessonIds,
      tribeSlug,
    ]
  );

  return {
    courseWithOverrides,
    isLessonCompleted,
    pendingCompletionLessonIds,
    toggleLessonCompletion,
  };
}

/**
 * Remembers the lesson being viewed on the server and in the shared client state.
 *
 * @param input - Course id, tracked lesson, tribe slug and the viewed callback.
 */
function useLastViewedLessonTracking({
  courseId,
  onLessonViewed,
  trackedLessonId,
  tribeSlug,
}: {
  courseId: string;
  onLessonViewed: TribeCoursesViewProps["onLessonViewed"];
  trackedLessonId: string | null;
  tribeSlug: string;
}) {
  // Best-effort resume tracking: remembering the last opened lesson must never
  // interrupt playback, so failures are deliberately ignored (the only cost is
  // resuming from the previous lesson next time).
  useEffect(() => {
    if (!trackedLessonId) {
      return;
    }

    const abortController = new AbortController();

    fetch(buildLastViewedLessonApiUrl(tribeSlug, courseId), {
      body: JSON.stringify({ lessonId: trackedLessonId }),
      headers: {
        [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
      },
      method: HTTP_METHOD.put,
      signal: abortController.signal,
    }).catch(() => undefined);

    return () => abortController.abort();
  }, [trackedLessonId, courseId, tribeSlug]);

  // Mirrors the resume point in the shared client state right away, so the
  // catalog and a reopened course agree with the request sent above.
  useEffect(() => {
    if (trackedLessonId) {
      onLessonViewed?.(courseId, trackedLessonId);
    }
  }, [courseId, onLessonViewed, trackedLessonId]);
}

/**
 * Finds the lessons before and after the active one among the visible lessons.
 *
 * @param visibleLessons - Lessons of the unlocked modules, in order.
 * @param activeLesson - Lesson being viewed.
 * @returns The previous and next lessons, or `null` at either end.
 */
function findAdjacentLessons(
  visibleLessons: LessonWithViewerStateResult[],
  activeLesson: LessonWithViewerStateResult | null
) {
  const activeLessonIndex = activeLesson
    ? visibleLessons.findIndex((lesson) => lesson.id === activeLesson.id)
    : -1;
  const previousLesson =
    activeLessonIndex > 0 ? visibleLessons[activeLessonIndex - 1] : null;
  const nextLesson =
    activeLessonIndex >= 0 && activeLessonIndex < visibleLessons.length - 1
      ? visibleLessons[activeLessonIndex + 1]
      : null;

  return { nextLesson, previousLesson };
}

/**
 * Lists the downloadable files of a lesson.
 *
 * @param props - Lesson files and tribe slug.
 * @returns The lesson files section.
 */
function LessonFiles({
  files,
  tribeSlug,
}: {
  files: LessonFileResult[];
  tribeSlug: string;
}) {
  return (
    <section
      aria-label={COURSES_COPY.lessonFilesHeading}
      className={styles.TribeCoursesView__lessonFiles}
    >
      <h3 className={styles.TribeCoursesView__lessonFilesHeading}>
        {COURSES_COPY.lessonFilesHeading}
      </h3>
      <ul className={styles.TribeCoursesView__fileList}>
        {sortLessonFiles(files).map((lessonFile) => (
          <li
            className={styles.TribeCoursesView__fileItem}
            key={lessonFile.id}
          >
            <a
              aria-label={
                COURSES_COPY.downloadFilePrefix +
                lessonFile.fileName
              }
              className={styles.TribeCoursesView__fileLink}
              href={buildLessonFileDownloadHref(
                tribeSlug,
                lessonFile.id
              )}
            >
              <FileText
                aria-hidden
                className={styles.TribeCoursesView__fileIcon}
              />
              <span
                className={styles.TribeCoursesView__fileName}
              >
                {lessonFile.fileName}
              </span>
              <span
                className={styles.TribeCoursesView__fileSize}
              >
                {formatFileSize(lessonFile.fileSizeBytes)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

type ActiveLessonProps = {
  activeLesson: LessonWithViewerStateResult;
  completion: ReturnType<typeof useLessonCompletion>;
  tribeSlug: string;
};

/**
 * Renders the active lesson title, completion toggle, description and files.
 * Keyed by lesson by the caller so each switch replays the CSS entrance.
 *
 * @param props - Active lesson, completion state and tribe slug.
 * @returns The lesson body.
 */
function ActiveLessonBody({ activeLesson, completion, tribeSlug }: ActiveLessonProps) {
  const isActiveLessonCompleted = completion.isLessonCompleted(activeLesson);
  const isPending = completion.pendingCompletionLessonIds.has(activeLesson.id);

  return (
    <div className={styles.TribeCoursesView__lessonBody}>
      <div className={styles.TribeCoursesView__lessonHeader}>
        <h2 className={styles.TribeCoursesView__lessonHeading}>
          {activeLesson.title}
        </h2>
        <Button
          aria-busy={isPending || undefined}
          aria-pressed={isActiveLessonCompleted}
          disabled={isPending}
          onClick={() => completion.toggleLessonCompletion(activeLesson)}
          type="button"
          variant={isActiveLessonCompleted ? "primary" : "secondary"}
        >
          <Check aria-hidden />
          {isActiveLessonCompleted
            ? COURSES_COPY.uncompleteButton
            : COURSES_COPY.completeButton}
        </Button>
      </div>
      {activeLesson.description ? (
        <div className={styles.TribeCoursesView__lessonDescription}>
          <p
            className={styles.TribeCoursesView__lessonDescriptionText}
          >
            <RichTextContent content={activeLesson.description} />
          </p>
        </div>
      ) : null}
      {activeLesson.files?.length ? (
        <LessonFiles files={activeLesson.files} tribeSlug={tribeSlug} />
      ) : null}
    </div>
  );
}

/**
 * Renders the previous and next lesson buttons.
 *
 * @param props - Adjacent lessons and the navigation handler.
 * @returns The lesson navigation.
 */
function LessonPager({
  navigateToLesson,
  nextLesson,
  previousLesson,
}: ReturnType<typeof findAdjacentLessons> & {
  navigateToLesson: (lessonId: string) => void;
}) {
  return (
    <nav
      aria-label={COURSES_COPY.lessonNavigationLabel}
      className={styles.TribeCoursesView__lessonNav}
    >
      {previousLesson ? (
        <Button
          onClick={() => navigateToLesson(previousLesson.id)}
          type="button"
          variant="secondary"
        >
          <ChevronLeft aria-hidden />
          {COURSES_COPY.previousLessonButton}
        </Button>
      ) : (
        <span aria-hidden />
      )}
      {nextLesson ? (
        <Button
          onClick={() => navigateToLesson(nextLesson.id)}
          type="button"
        >
          {COURSES_COPY.nextLessonButton}
          <ChevronRight aria-hidden />
        </Button>
      ) : null}
    </nav>
  );
}

/**
 * Renders the player, body, pager and comments of the active lesson.
 *
 * @param props - Active lesson, completion state, pager and tribe slug.
 * @returns The active lesson content.
 */
function ActiveLesson({
  activeLesson,
  adjacentLessons,
  completion,
  navigateToLesson,
  tribeSlug,
}: ActiveLessonProps & {
  adjacentLessons: ReturnType<typeof findAdjacentLessons>;
  navigateToLesson: (lessonId: string) => void;
}) {
  return (
    <>
      <div className={styles.TribeCoursesView__playerFrame}>
        <iframe
          allow={PLAYER_IFRAME_ALLOW}
          sandbox={PLAYER_IFRAME_SANDBOX}
          allowFullScreen
          className={styles.TribeCoursesView__playerIframe}
          src={buildPlayerEmbedSource(
            activeLesson.videoProvider,
            activeLesson.externalVideoId
          )}
          title={activeLesson.title}
        />
      </div>
      {/* Keyed by lesson so each switch replays the CSS entrance. */}
      <ActiveLessonBody
        activeLesson={activeLesson}
        completion={completion}
        key={LESSON_BODY_KEY_PREFIX + activeLesson.id}
        tribeSlug={tribeSlug}
      />
      <LessonPager
        navigateToLesson={navigateToLesson}
        nextLesson={adjacentLessons.nextLesson}
        previousLesson={adjacentLessons.previousLesson}
      />
      <LessonComments
        key={activeLesson.id}
        lessonId={activeLesson.id}
        tribeSlug={tribeSlug}
      />
    </>
  );
}

type SidebarLessonLinkProps = {
  completed: boolean;
  courseId: string;
  isActive: boolean;
  lesson: LessonWithViewerStateResult;
  lessonIndex: number;
  onLessonSelect: (event: MouseEvent<HTMLAnchorElement>, lessonId: string) => void;
  tribeSlug: string;
};

/**
 * Renders the sidebar link of a lesson with its number or completion check.
 *
 * @param props - Lesson, position, state, course id, tribe slug and select handler.
 * @returns The lesson link.
 */
function SidebarLessonLink({
  completed,
  courseId,
  isActive,
  lesson,
  lessonIndex,
  onLessonSelect,
  tribeSlug,
}: SidebarLessonLinkProps) {
  return (
    <a
      aria-current={
        isActive ? ARIA_CURRENT_PAGE : undefined
      }
      className={cn(
        styles.TribeCoursesView__lessonLink,
        isActive &&
          styles["TribeCoursesView__lessonLink--active"]
      )}
      href={buildLessonHref(
        tribeSlug,
        courseId,
        lesson.id
      )}
      onClick={(event) =>
        onLessonSelect(event, lesson.id)
      }
    >
      {isActive ? (
        <m.span
          aria-hidden
          className={
            styles.TribeCoursesView__activeIndicator
          }
          layoutId={ACTIVE_LESSON_INDICATOR_LAYOUT_ID}
          transition={SPRING_LAYOUT}
        />
      ) : null}
      <PresenceSwap
        as="span"
        className={styles.TribeCoursesView__lessonMarker}
        mode="popLayout"
        presenceKey={
          completed
            ? LESSON_MARKER_KEY.completed
            : LESSON_MARKER_KEY.number
        }
      >
        {completed ? (
          <span
            aria-label={COURSES_COPY.completedBadge}
            className={
              styles.TribeCoursesView__lessonCheck
            }
            role={IMAGE_ROLE}
          >
            <Check aria-hidden />
          </span>
        ) : (
          <span
            aria-hidden
            className={
              styles.TribeCoursesView__lessonNumber
            }
          >
            {lessonIndex + 1}
          </span>
        )}
      </PresenceSwap>
      <span
        className={styles.TribeCoursesView__lessonTitle}
      >
        {lesson.title}
      </span>
    </a>
  );
}

type CourseSidebarProps = {
  activeLessonId: string | null;
  course: CourseWithModulesResult;
  courseHeadingRef: RefObject<HTMLHeadingElement | null>;
  isLessonCompleted: (lesson: LessonWithViewerStateResult) => boolean;
  navigation: Omit<ReturnType<typeof useLessonNavigation>, "lessonArticleRef">;
  progressPercent: number;
  tribeSlug: string;
  viewerPermissions: CourseTreeViewerPermissionsResult;
};

/**
 * Renders one module of the sidebar: its lessons, or the unlock note when locked.
 *
 * @param props - Module, active lesson, completion lookup and lesson select handler.
 * @returns The module group.
 */
function SidebarModule({
  activeLessonId,
  course,
  courseModule,
  isLessonCompleted,
  navigation,
  tribeSlug,
}: Pick<CourseSidebarProps, "activeLessonId" | "course" | "isLessonCompleted" | "navigation" | "tribeSlug"> & {
  courseModule: CourseWithModulesResult["modules"][number];
}) {
  const unlockDateLabel = formatUnlockDate(
    courseModule.viewerAccess.unlocksAt
  );

  return (
    <section className={styles.TribeCoursesView__moduleGroup}>
      <h3 className={styles.TribeCoursesView__moduleTitle}>
        {courseModule.viewerAccess.isLocked ? (
          <Lock
            aria-hidden
            className={styles.TribeCoursesView__moduleLockIcon}
          />
        ) : null}
        {courseModule.title}
      </h3>
      {courseModule.viewerAccess.isLocked ? (
        <p className={styles.TribeCoursesView__moduleLockedNote}>
          {unlockDateLabel
            ? `${COURSES_COPY.lockedModulePrefix}${unlockDateLabel}.`
            : null}
        </p>
      ) : (
        <ul className={styles.TribeCoursesView__lessonList}>
          {courseModule.lessons.map((lesson, lessonIndex) => (
            <li
              className={styles.TribeCoursesView__lessonItem}
              key={lesson.id}
            >
              <SidebarLessonLink
                completed={isLessonCompleted(lesson)}
                courseId={course.id}
                isActive={activeLessonId === lesson.id}
                lesson={lesson}
                lessonIndex={lessonIndex}
                onLessonSelect={navigation.handleLessonSelect}
                tribeSlug={tribeSlug}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Renders the sidebar: back link, course heading, progress and module tree.
 *
 * @param props - Course, active lesson, progress, navigation and permissions.
 * @returns The course sidebar navigation.
 */
function CourseSidebar(props: CourseSidebarProps) {
  const { course, courseHeadingRef, navigation, progressPercent, tribeSlug } = props;

  return (
    <nav
      aria-label={course.title}
      className={styles.TribeCoursesView__sidebar}
    >
      <Link
        className={styles.TribeCoursesView__backLink}
        href={ROUTES.tribes.courses(tribeSlug)}
        onClick={navigation.handleBackToCatalogClick}
      >
        <ArrowLeft aria-hidden />
        {COURSES_COPY.backToCatalog}
      </Link>
      <div className={styles.TribeCoursesView__sidebarHeader}>
        <h2
          className={styles.TribeCoursesView__sidebarHeading}
          ref={courseHeadingRef}
          tabIndex={-1}
        >
          {course.title}
        </h2>
        {props.viewerPermissions.canManageCourses ? (
          <CourseManagementLink tribeSlug={tribeSlug} />
        ) : null}
      </div>
      <div className={styles.TribeCoursesView__progress}>
        <div
          aria-label={COURSES_COPY.progressLabel}
          aria-valuemax={PERCENT_MAX}
          aria-valuemin={0}
          aria-valuenow={progressPercent}
          className={styles.TribeCoursesView__progressTrack}
          role={PROGRESSBAR_ROLE}
        >
          <span
            className={styles.TribeCoursesView__progressFill}
            style={buildProgressFillStyle(progressPercent)}
          />
        </div>
        <p className={styles.TribeCoursesView__progressLabel}>
          {progressPercent}
          {COURSES_COPY.progressSuffix}
        </p>
      </div>
      {course.modules.map((courseModule) => (
        <SidebarModule {...props} courseModule={courseModule} key={courseModule.id} />
      ))}
    </nav>
  );
}

/**
 * Empty course notice, with the management link for course managers.
 *
 * @param props - Heading ref, tribe slug and permissions.
 * @returns The empty state section.
 */
function EmptyCourse({
  courseHeadingRef,
  tribeSlug,
  viewerPermissions,
}: Pick<CourseSidebarProps, "courseHeadingRef" | "tribeSlug" | "viewerPermissions">) {
  return (
    <section className={styles.TribeCoursesView__emptyState}>
      <h2
        className={styles.TribeCoursesView__emptyHeading}
        ref={courseHeadingRef}
        tabIndex={-1}
      >
        {COURSES_COPY.emptyHeading}
      </h2>
      <p className={styles.TribeCoursesView__emptyDescription}>
        {COURSES_COPY.emptyDescription}
      </p>
      {viewerPermissions.canManageCourses ? (
        <div className={styles.TribeCoursesView__emptyActions}>
          <CourseManagementLink tribeSlug={tribeSlug} />
        </div>
      ) : null}
    </section>
  );
}

/**
 * Course player: video, lesson details, files, comments and a sidebar with
 * the module tree and progress. Lesson selection is client-side and mirrored
 * in the shareable URL through the History API. Inside `TribeCoursesBrowser`
 * the back link returns to the catalog in-page and completion and resume
 * changes are reported to the shared client state.
 *
 * @param props - Course tree, initial lesson, in-page callbacks, tribe slug and permissions.
 * @returns Course view page content.
 */
export function TribeCoursesView({
  course,
  onBackToCatalog,
  onLessonCompletionChange,
  onLessonViewed,
  revealHeadingOnMount = false,
  selectedLessonId,
  tribeSlug,
  viewerPermissions,
}: TribeCoursesViewProps) {
  const courseHeadingRef = useRef<HTMLHeadingElement>(null);

  useRevealViewHeadingOnMount(courseHeadingRef, revealHeadingOnMount);
  const { lessonArticleRef, ...navigation } = useLessonNavigation({
    course,
    onBackToCatalog,
    selectedLessonId,
    tribeSlug,
  });
  const completion = useLessonCompletion({ course, onLessonCompletionChange, tribeSlug });

  const activeLesson = findInitialLesson(course, navigation.activeLessonId);
  const visibleLessons = useMemo(
    () => flattenVisibleLessons(course),
    [course]
  );
  const progressPercent = getCourseProgressPercent(completion.courseWithOverrides);

  useLastViewedLessonTracking({
    courseId: course.id,
    onLessonViewed,
    trackedLessonId: activeLesson?.id ?? null,
    tribeSlug,
  });

  if (visibleLessons.length === 0 && course.modules.length === 0) {
    return (
      <main className={styles.TribeCoursesView}>
        <EmptyCourse
          courseHeadingRef={courseHeadingRef}
          tribeSlug={tribeSlug}
          viewerPermissions={viewerPermissions}
        />
      </main>
    );
  }

  return (
    <main className={styles.TribeCoursesView}>
      <div className={styles.TribeCoursesView__layout}>
        <article
          className={styles.TribeCoursesView__main}
          ref={lessonArticleRef}
        >
          {activeLesson ? (
            <ActiveLesson
              activeLesson={activeLesson}
              adjacentLessons={findAdjacentLessons(visibleLessons, activeLesson)}
              completion={completion}
              navigateToLesson={navigation.navigateToLesson}
              tribeSlug={tribeSlug}
            />
          ) : (
            <p className={styles.TribeCoursesView__emptyMessage}>
              {COURSES_COPY.selectLessonPrompt}
            </p>
          )}
        </article>

        <CourseSidebar
          activeLessonId={activeLesson?.id ?? null}
          course={course}
          courseHeadingRef={courseHeadingRef}
          isLessonCompleted={completion.isLessonCompleted}
          navigation={navigation}
          progressPercent={progressPercent}
          tribeSlug={tribeSlug}
          viewerPermissions={viewerPermissions}
        />
      </div>
    </main>
  );
}
