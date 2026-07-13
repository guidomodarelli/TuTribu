import { Settings } from "lucide-react";
import Image from "next/image";

import { Link } from "@/components/navigation/link";
import { ROUTES } from "@/src/constants/routes";
import type {
  CourseTreeViewerPermissionsResult,
  CourseWithModulesResult,
} from "@/src/modules/courses/application/results/course-results";
import {
  countCourseLessons,
  getCourseProgressPercent,
} from "@/src/modules/courses/application/course-progress";
import styles from "./styles.module.scss";

const CATALOG_COPY = {
  continueCta: "Continuar",
  emptyDescription: "Todavía no hay cursos cargados para esta tribu.",
  emptyHeading: "Aún no hay cursos",
  heading: "Cursos",
  inactiveBadge: "Inactivo",
  lessonCountSuffixPlural: "lecciones",
  lessonCountSuffixSingular: "lección",
  manageCta: "Gestionar",
  progressSuffix: "% completado",
  startCta: "Empezar",
} as const;

const COURSE_QUERY_PARAM = "curso";
const PERCENT_MAX = 100;

/**
 * Builds the shareable URL of a course inside the tribe courses section.
 */
export function buildCourseHref(tribeSlug: string, courseId: string): string {
  return `${ROUTES.tribes.courses(tribeSlug)}?${COURSE_QUERY_PARAM}=${courseId}`;
}

type TribeCoursesCatalogProps = {
  courses: CourseWithModulesResult[];
  tribeSlug: string;
  viewerPermissions: CourseTreeViewerPermissionsResult;
};

function formatLessonCount(lessonCount: number): string {
  const suffix =
    lessonCount === 1
      ? CATALOG_COPY.lessonCountSuffixSingular
      : CATALOG_COPY.lessonCountSuffixPlural;

  return `${lessonCount} ${suffix}`;
}

function CourseManagementLink({ tribeSlug }: { tribeSlug: string }) {
  return (
    <Link
      className={styles.TribeCoursesCatalog__managementLink}
      href={ROUTES.tribes.coursesManage(tribeSlug)}
    >
      <Settings aria-hidden />
      {CATALOG_COPY.manageCta}
    </Link>
  );
}

export function TribeCoursesCatalog({
  courses,
  tribeSlug,
  viewerPermissions,
}: TribeCoursesCatalogProps) {
  return (
    <main className={styles.TribeCoursesCatalog}>
      <header className={styles.TribeCoursesCatalog__header}>
        <h1 className={styles.TribeCoursesCatalog__heading}>
          {CATALOG_COPY.heading}
        </h1>
        {viewerPermissions.canManageCourses ? (
          <CourseManagementLink tribeSlug={tribeSlug} />
        ) : null}
      </header>

      {courses.length === 0 ? (
        <section className={styles.TribeCoursesCatalog__emptyState}>
          <h2 className={styles.TribeCoursesCatalog__emptyHeading}>
            {CATALOG_COPY.emptyHeading}
          </h2>
          <p className={styles.TribeCoursesCatalog__emptyDescription}>
            {CATALOG_COPY.emptyDescription}
          </p>
        </section>
      ) : (
        <ul className={styles.TribeCoursesCatalog__grid}>
          {courses.map((course) => {
            const lessonCount = countCourseLessons(course);
            const progressPercent = getCourseProgressPercent(course);
            const hasProgress =
              progressPercent > 0 || course.lastViewedLessonId !== null;

            return (
              <li className={styles.TribeCoursesCatalog__cardItem} key={course.id}>
                <Link
                  className={styles.TribeCoursesCatalog__card}
                  href={buildCourseHref(tribeSlug, course.id)}
                >
                  <div className={styles.TribeCoursesCatalog__coverFrame}>
                    {course.coverImageUrl ? (
                      <Image
                        alt=""
                        className={styles.TribeCoursesCatalog__coverImage}
                        fill
                        sizes="(min-width: 64rem) 20rem, 100vw"
                        src={course.coverImageUrl}
                        unoptimized
                      />
                    ) : (
                      <div
                        aria-hidden
                        className={styles.TribeCoursesCatalog__coverFallback}
                      >
                        {course.title.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className={styles.TribeCoursesCatalog__cardBody}>
                    <h2 className={styles.TribeCoursesCatalog__cardTitle}>
                      {course.title}
                      {!course.isActive ? (
                        <span
                          className={styles.TribeCoursesCatalog__inactiveBadge}
                        >
                          {CATALOG_COPY.inactiveBadge}
                        </span>
                      ) : null}
                    </h2>
                    {course.description ? (
                      <p className={styles.TribeCoursesCatalog__cardDescription}>
                        {course.description}
                      </p>
                    ) : null}
                    <p className={styles.TribeCoursesCatalog__cardMeta}>
                      {formatLessonCount(lessonCount)}
                    </p>
                    <div
                      aria-valuemax={PERCENT_MAX}
                      aria-valuemin={0}
                      aria-valuenow={progressPercent}
                      className={styles.TribeCoursesCatalog__progressTrack}
                      role="progressbar"
                    >
                      <span
                        className={styles.TribeCoursesCatalog__progressFill}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className={styles.TribeCoursesCatalog__progressLabel}>
                      {progressPercent}
                      {CATALOG_COPY.progressSuffix}
                    </p>
                    <span className={styles.TribeCoursesCatalog__cardCta}>
                      {hasProgress
                        ? CATALOG_COPY.continueCta
                        : CATALOG_COPY.startCta}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
