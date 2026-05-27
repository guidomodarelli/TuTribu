import Link from "next/link";

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

function buildLessonHref(tribeSlug: string, lessonId: string): string {
  return `${ROUTES.tribes.courses(tribeSlug)}${QUERY_STRING_PREFIX}${LESSON_QUERY_PARAM}${QUERY_PARAM_VALUE_SEPARATOR}${lessonId}`;
}
const COURSES_COPY = {
  emptyDescription:
    "Todavía no hay módulos cargados para esta tribu.",
  emptyHeading: "Aún no hay cursos",
  inactiveBadge: "Inactivo",
  manageCta: "Gestionar cursos",
  pageHeading: "Cursos",
  selectLessonPrompt: "Elegí una lección de la barra lateral para empezar.",
  sidebarHeading: "Contenido",
} as const;

type TribeCoursesViewProps = {
  modules: CourseModuleWithLessonsResult[];
  selectedLessonId: string | null;
  tribeSlug: string;
  viewerPermissions: CourseTreeViewerPermissionsResult;
};

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
  const activeLesson = findInitialLesson(modules, selectedLessonId);
  const hasModules = modules.length > 0;

  return (
    <main className={styles.TribeCoursesView}>
      {viewerPermissions.canManageCourses ? (
        <header className={styles.TribeCoursesView__header}>
          <h1 className={styles.TribeCoursesView__heading}>
            {COURSES_COPY.pageHeading}
          </h1>
          <Link
            className={styles.TribeCoursesView__manageLink}
            href={ROUTES.tribes.coursesManage(tribeSlug)}
          >
            {COURSES_COPY.manageCta}
          </Link>
        </header>
      ) : null}

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
                      {activeLesson.description}
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
            <h2 className={styles.TribeCoursesView__sidebarHeading}>
              {COURSES_COPY.sidebarHeading}
            </h2>
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
                        <Link
                          aria-current={isActive ? ARIA_CURRENT_PAGE : undefined}
                          className={
                            isActive
                              ? `${styles.TribeCoursesView__lessonLink} ${styles["TribeCoursesView__lessonLink--active"]}`
                              : styles.TribeCoursesView__lessonLink
                          }
                          href={buildLessonHref(tribeSlug, lesson.id)}
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
                        </Link>
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
        </section>
      )}
    </main>
  );
}
