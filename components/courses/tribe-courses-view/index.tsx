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
} from "react";
import { motion } from "motion/react";
import { toast, Button } from "beez-ui";

import { LessonComments } from "@/components/courses/lesson-comments";
import { PresenceSwap } from "@/components/motion/presence-swap";
import { Link } from "@/components/navigation/link";
import { RichTextContent } from "@/components/rich-text/rich-text-content";

import { formatFileSize } from "@/lib/format-file-size";
import { joinClassNames } from "@/lib/motion/join-class-names";
import { SPRING_LAYOUT } from "@/lib/motion/tokens";
import { ROUTES } from "@/src/constants/routes";
import type {
  CourseTreeViewerPermissionsResult,
  CourseWithModulesResult,
  LessonWithViewerStateResult,
} from "@/src/modules/courses/application/results/course-results";
import { getCourseProgressPercent } from "@/src/modules/courses/application/course-progress";
import {
  PLAYER_IFRAME_ALLOW,
  buildPlayerEmbedSource,
} from "@/src/modules/shared/application/video/build-player-embed-source";
import styles from "./styles.module.scss";

const COURSE_QUERY_PARAM = "curso";
const LESSON_QUERY_PARAM = "leccion";
const ARIA_CURRENT_PAGE = "page";
const POPSTATE_EVENT = "popstate";
const HISTORY_UNUSED_TITLE = "";
const PRIMARY_MOUSE_BUTTON = 0;
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
 * Course player: video, lesson details, files, comments and a sidebar with
 * the module tree and progress. Lesson selection is client-side and mirrored
 * in the shareable URL through the History API.
 *
 * @param props - Course tree, initial lesson, tribe slug and permissions.
 * @returns Course view page content.
 */
export function TribeCoursesView({
  course,
  selectedLessonId,
  tribeSlug,
  viewerPermissions,
}: TribeCoursesViewProps) {
  const lessonArticleRef = useRef<HTMLElement>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(
    selectedLessonId
  );
  const [completionOverrides, setCompletionOverrides] = useState<
    Map<string, boolean>
  >(() => new Map());
  const [pendingCompletionLessonIds, setPendingCompletionLessonIds] = useState<
    Set<string>
  >(() => new Set());

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

  // On phones the sidebar sits below the player, and long lessons push the
  // player above the fold on desktop: bring the new lesson's top into view
  // whenever it is scrolled past, so the selection visibly takes effect.
  const revealLessonArticle = useCallback(() => {
    const lessonArticle = lessonArticleRef.current;

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
  }, []);

  const navigateToLesson = useCallback(
    (lessonId: string) => {
      setActiveLessonId(lessonId);
      window.history.pushState(
        null,
        HISTORY_UNUSED_TITLE,
        buildLessonHref(tribeSlug, course.id, lessonId)
      );
      revealLessonArticle();
    },
    [course.id, revealLessonArticle, tribeSlug]
  );

  // Select a lesson without a server round-trip: the view already holds every
  // lesson, so we update local state and reflect the shareable `leccion` query
  // through the History API instead of navigating. Modified clicks (new tab,
  // etc.) fall through to the real link so the URL stays openable on its own.
  const handleLessonSelect = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, lessonId: string) => {
      if (
        event.defaultPrevented ||
        event.button !== PRIMARY_MOUSE_BUTTON ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      navigateToLesson(lessonId);
    },
    [navigateToLesson]
  );

  const activeLesson = findInitialLesson(course, activeLessonId);
  const visibleLessons = useMemo(
    () => flattenVisibleLessons(course),
    [course]
  );
  const activeLessonIndex = activeLesson
    ? visibleLessons.findIndex((lesson) => lesson.id === activeLesson.id)
    : -1;
  const previousLesson =
    activeLessonIndex > 0 ? visibleLessons[activeLessonIndex - 1] : null;
  const nextLesson =
    activeLessonIndex >= 0 && activeLessonIndex < visibleLessons.length - 1
      ? visibleLessons[activeLessonIndex + 1]
      : null;

  const isLessonCompleted = useCallback(
    (lesson: LessonWithViewerStateResult): boolean =>
      completionOverrides.get(lesson.id) ?? lesson.completed,
    [completionOverrides]
  );

  const courseWithOverrides = useMemo<CourseWithModulesResult>(
    () => ({
      ...course,
      modules: course.modules.map((courseModule) => ({
        ...courseModule,
        lessons: courseModule.lessons.map((lesson) => ({
          ...lesson,
          completed: completionOverrides.get(lesson.id) ?? lesson.completed,
        })),
      })),
    }),
    [completionOverrides, course]
  );
  const progressPercent = getCourseProgressPercent(courseWithOverrides);

  // Best-effort resume tracking: remembering the last opened lesson must never
  // interrupt playback, so failures are deliberately ignored (the only cost is
  // resuming from the previous lesson next time).
  const trackedLessonId = activeLesson?.id ?? null;
  useEffect(() => {
    if (!trackedLessonId) {
      return;
    }

    const abortController = new AbortController();

    fetch(buildLastViewedLessonApiUrl(tribeSlug, course.id), {
      body: JSON.stringify({ lessonId: trackedLessonId }),
      headers: {
        [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
      },
      method: HTTP_METHOD.put,
      signal: abortController.signal,
    }).catch(() => undefined);

    return () => abortController.abort();
  }, [trackedLessonId, course.id, tribeSlug]);

  const toggleLessonCompletion = useCallback(
    async (lesson: LessonWithViewerStateResult) => {
      if (pendingCompletionLessonIds.has(lesson.id)) {
        return;
      }

      const previousValue =
        completionOverrides.get(lesson.id) ?? lesson.completed;
      const nextValue = !previousValue;

      setPendingCompletionLessonIds((current) => {
        const next = new Set(current);
        next.add(lesson.id);
        return next;
      });
      setCompletionOverrides((current) => {
        const next = new Map(current);
        next.set(lesson.id, nextValue);
        return next;
      });

      try {
        const response = await fetch(
          buildLessonCompletionApiUrl(tribeSlug, lesson.id),
          {
            body: JSON.stringify({ completed: nextValue }),
            headers: {
              [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
            },
            method: HTTP_METHOD.put,
          }
        );

        if (!response.ok) {
          setCompletionOverrides((current) => {
            const next = new Map(current);
            next.set(lesson.id, previousValue);
            return next;
          });
          toast.error(COURSES_COPY.completionError);
        }
      } catch {
        setCompletionOverrides((current) => {
          const next = new Map(current);
          next.set(lesson.id, previousValue);
          return next;
        });
        toast.error(COURSES_COPY.completionError);
      } finally {
        setPendingCompletionLessonIds((current) => {
          const next = new Set(current);
          next.delete(lesson.id);
          return next;
        });
      }
    },
    [completionOverrides, pendingCompletionLessonIds, tribeSlug]
  );

  const hasLessons = visibleLessons.length > 0 || course.modules.length > 0;
  const isActiveLessonCompleted = activeLesson
    ? isLessonCompleted(activeLesson)
    : false;

  return (
    <main className={styles.TribeCoursesView}>
      {hasLessons ? (
        <div className={styles.TribeCoursesView__layout}>
          <article
            className={styles.TribeCoursesView__main}
            ref={lessonArticleRef}
          >
            {activeLesson ? (
              <>
                <div className={styles.TribeCoursesView__playerFrame}>
                  <iframe
                    allow={PLAYER_IFRAME_ALLOW}
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
                <div
                  className={styles.TribeCoursesView__lessonBody}
                  key={LESSON_BODY_KEY_PREFIX + activeLesson.id}
                >
                  <div className={styles.TribeCoursesView__lessonHeader}>
                    <h2 className={styles.TribeCoursesView__lessonHeading}>
                      {activeLesson.title}
                    </h2>
                    <Button
                      aria-busy={
                        pendingCompletionLessonIds.has(activeLesson.id) ||
                        undefined
                      }
                      aria-pressed={isActiveLessonCompleted}
                      disabled={pendingCompletionLessonIds.has(activeLesson.id)}
                      onClick={() => toggleLessonCompletion(activeLesson)}
                      type="button"
                      variant={isActiveLessonCompleted ? "default" : "outline"}
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
                    <section
                      aria-label={COURSES_COPY.lessonFilesHeading}
                      className={styles.TribeCoursesView__lessonFiles}
                    >
                      <h3 className={styles.TribeCoursesView__lessonFilesHeading}>
                        {COURSES_COPY.lessonFilesHeading}
                      </h3>
                      <ul className={styles.TribeCoursesView__fileList}>
                        {sortLessonFiles(activeLesson.files).map((lessonFile) => (
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
                  ) : null}
                </div>
                <nav
                  aria-label={COURSES_COPY.lessonNavigationLabel}
                  className={styles.TribeCoursesView__lessonNav}
                >
                  {previousLesson ? (
                    <Button
                      onClick={() => navigateToLesson(previousLesson.id)}
                      type="button"
                      variant="outline"
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
                <LessonComments
                  key={activeLesson.id}
                  lessonId={activeLesson.id}
                  tribeSlug={tribeSlug}
                />
              </>
            ) : (
              <p className={styles.TribeCoursesView__emptyMessage}>
                {COURSES_COPY.selectLessonPrompt}
              </p>
            )}
          </article>

          <nav
            aria-label={course.title}
            className={styles.TribeCoursesView__sidebar}
          >
            <Link
              className={styles.TribeCoursesView__backLink}
              href={ROUTES.tribes.courses(tribeSlug)}
            >
              <ArrowLeft aria-hidden />
              {COURSES_COPY.backToCatalog}
            </Link>
            <div className={styles.TribeCoursesView__sidebarHeader}>
              <h2 className={styles.TribeCoursesView__sidebarHeading}>
                {course.title}
              </h2>
              {viewerPermissions.canManageCourses ? (
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
            {course.modules.map((courseModule) => {
              const unlockDateLabel = formatUnlockDate(
                courseModule.viewerAccess.unlocksAt
              );

              return (
                <section
                  className={styles.TribeCoursesView__moduleGroup}
                  key={courseModule.id}
                >
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
                      {courseModule.lessons.map((lesson, lessonIndex) => {
                        const isActive = activeLesson?.id === lesson.id;
                        const completed = isLessonCompleted(lesson);
                        return (
                          <li
                            className={styles.TribeCoursesView__lessonItem}
                            key={lesson.id}
                          >
                            <a
                              aria-current={
                                isActive ? ARIA_CURRENT_PAGE : undefined
                              }
                              className={joinClassNames(
                                styles.TribeCoursesView__lessonLink,
                                isActive &&
                                  styles["TribeCoursesView__lessonLink--active"]
                              )}
                              href={buildLessonHref(
                                tribeSlug,
                                course.id,
                                lesson.id
                              )}
                              onClick={(event) =>
                                handleLessonSelect(event, lesson.id)
                              }
                            >
                              {isActive ? (
                                <motion.span
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
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </nav>
        </div>
      ) : (
        <section className={styles.TribeCoursesView__emptyState}>
          <h2 className={styles.TribeCoursesView__emptyHeading}>
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
      )}
    </main>
  );
}
