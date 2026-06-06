"use client";

import { Settings } from "lucide-react";
import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { Link } from "@/components/navigation/link";
import { RichTextContent } from "@/components/rich-text/rich-text-content";
import { ROUTES } from "@/src/constants/routes";
import type {
  CourseModuleWithLessonsResult,
  CourseTreeViewerPermissionsResult,
  LessonResult,
} from "@/src/modules/courses/application/results/course-results";
import {
  PLAYER_IFRAME_ALLOW,
  buildPlayerEmbedSource,
} from "@/src/modules/shared/application/video/build-player-embed-source";
import styles from "./styles.module.scss";

const LESSON_QUERY_PARAM = "leccion";
const ARIA_CURRENT_PAGE = "page";
const QUERY_STRING_PREFIX = "?";
const QUERY_PARAM_VALUE_SEPARATOR = "=";
const POPSTATE_EVENT = "popstate";
const HISTORY_UNUSED_TITLE = "";
const PRIMARY_MOUSE_BUTTON = 0;

function buildLessonHref(tribeSlug: string, lessonId: string): string {
  return `${ROUTES.tribes.courses(tribeSlug)}${QUERY_STRING_PREFIX}${LESSON_QUERY_PARAM}${QUERY_PARAM_VALUE_SEPARATOR}${lessonId}`;
}
const COURSES_COPY = {
  emptyDescription:
    "Todavía no hay módulos cargados para esta tribu.",
  emptyHeading: "Aún no hay cursos",
  inactiveBadge: "Inactivo",
  manageCta: "Gestionar",
  selectLessonPrompt: "Elegí una lección de la barra lateral para empezar.",
  sidebarHeading: "Contenido",
} as const;

type TribeCoursesViewProps = {
  modules: CourseModuleWithLessonsResult[];
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

function findInitialLesson(
  modules: CourseModuleWithLessonsResult[],
  selectedLessonId: string | null
): LessonResult | null {
  if (selectedLessonId) {
    for (const courseModule of modules) {
      const match = courseModule.lessons.find(
        (lesson) => lesson.id === selectedLessonId
      );
      if (match) {
        return match;
      }
    }
  }

  for (const courseModule of modules) {
    if (courseModule.lessons.length > 0) {
      return courseModule.lessons[0]!;
    }
  }

  return null;
}

export function TribeCoursesView({
  modules,
  selectedLessonId,
  tribeSlug,
  viewerPermissions,
}: TribeCoursesViewProps) {
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
      setActiveLessonId(lessonId);
      window.history.pushState(
        null,
        HISTORY_UNUSED_TITLE,
        buildLessonHref(tribeSlug, lessonId)
      );
    },
    [tribeSlug]
  );

  const activeLesson = findInitialLesson(modules, activeLessonId);
  const hasModules = modules.length > 0;

  return (
    <main className={styles.TribeCoursesView}>
      {hasModules ? (
        <div className={styles.TribeCoursesView__layout}>
          <article className={styles.TribeCoursesView__main}>
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
                <h2 className={styles.TribeCoursesView__lessonHeading}>
                  {activeLesson.title}
                </h2>
                {activeLesson.description ? (
                  <div className={styles.TribeCoursesView__lessonDescription}>
                    <p
                      className={styles.TribeCoursesView__lessonDescriptionText}
                    >
                      <RichTextContent content={activeLesson.description} />
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className={styles.TribeCoursesView__emptyMessage}>
                {COURSES_COPY.selectLessonPrompt}
              </p>
            )}
          </article>

          <nav
            aria-label={COURSES_COPY.sidebarHeading}
            className={styles.TribeCoursesView__sidebar}
          >
            <div className={styles.TribeCoursesView__sidebarHeader}>
              <h2 className={styles.TribeCoursesView__sidebarHeading}>
                {COURSES_COPY.sidebarHeading}
              </h2>
              {viewerPermissions.canManageCourses ? (
                <CourseManagementLink tribeSlug={tribeSlug} />
              ) : null}
            </div>
            {modules.map((courseModule) => (
              <section
                className={styles.TribeCoursesView__moduleGroup}
                key={courseModule.id}
              >
                <h3 className={styles.TribeCoursesView__moduleTitle}>
                  {courseModule.title}
                </h3>
                <ul className={styles.TribeCoursesView__lessonList}>
                  {courseModule.lessons.map((lesson, lessonIndex) => {
                    const isActive = activeLesson?.id === lesson.id;
                    return (
                      <li
                        className={styles.TribeCoursesView__lessonItem}
                        key={lesson.id}
                      >
                        <a
                          aria-current={isActive ? ARIA_CURRENT_PAGE : undefined}
                          className={
                            isActive
                              ? `${styles.TribeCoursesView__lessonLink} ${styles["TribeCoursesView__lessonLink--active"]}`
                              : styles.TribeCoursesView__lessonLink
                          }
                          href={buildLessonHref(tribeSlug, lesson.id)}
                          onClick={(event) =>
                            handleLessonSelect(event, lesson.id)
                          }
                        >
                          <span
                            aria-hidden
                            className={styles.TribeCoursesView__lessonNumber}
                          >
                            {lessonIndex + 1}
                          </span>
                          <span className={styles.TribeCoursesView__lessonTitle}>
                            {lesson.title}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
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
