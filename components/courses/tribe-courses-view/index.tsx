import Link from "next/link";

import { ROUTES } from "@/src/constants/routes";
import type {
  CourseModuleWithLessonsResult,
  CourseTreeViewerPermissionsResult,
  LessonResult,
} from "@/src/modules/courses/application/results/course-results";
import {
  VIDEO_PROVIDER,
  type VideoProvider,
} from "@/src/modules/courses/constants/courses";
import styles from "./styles.module.scss";

const VIMEO_PLAYER_URL_PREFIX = "https://player.vimeo.com/video/";
const WISTIA_PLAYER_URL_PREFIX = "https://fast.wistia.net/embed/iframe/";
const LOOM_PLAYER_URL_PREFIX = "https://www.loom.com/embed/";
const YOUTUBE_PLAYER_URL_PREFIX = "https://www.youtube.com/embed/";
const VIMEO_UNLISTED_HASH_SEPARATOR = ":";
const VIMEO_HASH_QUERY_PARAM = "h";
const PLAYER_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
const LESSON_QUERY_PARAM = "leccion";
const ARIA_CURRENT_PAGE = "page";
const QUERY_STRING_PREFIX = "?";
const QUERY_PARAM_VALUE_SEPARATOR = "=";

function buildLessonHref(tribeSlug: string, lessonId: string): string {
  return `${ROUTES.tribes.courses(tribeSlug)}${QUERY_STRING_PREFIX}${LESSON_QUERY_PARAM}${QUERY_PARAM_VALUE_SEPARATOR}${lessonId}`;
}

function buildVimeoEmbedSource(externalId: string): string {
  const [id, hash] = externalId.split(VIMEO_UNLISTED_HASH_SEPARATOR);
  if (hash) {
    const playerUrl = new URL(`${VIMEO_PLAYER_URL_PREFIX}${id}`);
    playerUrl.searchParams.set(VIMEO_HASH_QUERY_PARAM, hash);
    return playerUrl.toString();
  }

  return `${VIMEO_PLAYER_URL_PREFIX}${id}`;
}

function buildPlayerEmbedSource(
  provider: VideoProvider,
  externalId: string
): string {
  switch (provider) {
    case VIDEO_PROVIDER.vimeo:
      return buildVimeoEmbedSource(externalId);
    case VIDEO_PROVIDER.wistia:
      return `${WISTIA_PLAYER_URL_PREFIX}${externalId}`;
    case VIDEO_PROVIDER.loom:
      return `${LOOM_PLAYER_URL_PREFIX}${externalId}`;
    case VIDEO_PROVIDER.youtube:
      return `${YOUTUBE_PLAYER_URL_PREFIX}${externalId}`;
    default:
      return "";
  }
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
      <header className={styles.TribeCoursesView__header}>
        <h1 className={styles.TribeCoursesView__heading}>
          {COURSES_COPY.pageHeading}
        </h1>
        {viewerPermissions.canManageCourses ? (
          <Link
            className={styles.TribeCoursesView__manageLink}
            href={ROUTES.tribes.coursesManage(tribeSlug)}
          >
            {COURSES_COPY.manageCta}
          </Link>
        ) : null}
      </header>

      {hasModules ? (
        <div className={styles.TribeCoursesView__layout}>
          <nav
            aria-label={COURSES_COPY.sidebarHeading}
            className={styles.TribeCoursesView__sidebar}
          >
            {modules.map((courseModule) => (
              <section
                className={styles.TribeCoursesView__moduleGroup}
                key={courseModule.id}
              >
                <h2 className={styles.TribeCoursesView__moduleTitle}>
                  {courseModule.title}
                </h2>
                <ul className={styles.TribeCoursesView__lessonList}>
                  {courseModule.lessons.map((lesson) => {
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
                  <p className={styles.TribeCoursesView__lessonDescription}>
                    {activeLesson.description}
                  </p>
                ) : null}
              </>
            ) : (
              <p className={styles.TribeCoursesView__emptyMessage}>
                {COURSES_COPY.selectLessonPrompt}
              </p>
            )}
          </article>
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
