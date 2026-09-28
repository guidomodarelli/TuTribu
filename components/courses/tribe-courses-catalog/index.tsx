"use client";

import { ArrowRight, Settings } from "lucide-react";
import Image from "next/image";
import { useRef, type MouseEvent } from "react";

import { Link } from "@/components/navigation/link";
import { useRevealViewHeadingOnMount } from "@/hooks/use-reveal-view-heading-on-mount";
import { buildTribeCoursesRoute } from "@/lib/courses/course-lesson-route";
import { isInPageLinkClick } from "@/lib/plain-link-click";
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
  progressLabel: "Progreso del curso",
  progressSuffix: "% completado",
  startCta: "Empezar",
} as const;

const PERCENT_MAX = 100;
const PROGRESSBAR_ROLE = "progressbar";

/**
 * Inline transform for the progress fill. Scaling instead of sizing keeps the
 * fill on the compositor and lets its CSS entrance grow it from zero.
 *
 * @param progressPercent - Progress between 0 and 100.
 * @returns Style object with the horizontal scale.
 */
function buildProgressFillStyle(progressPercent: number) {
  return { transform: `scaleX(${progressPercent / PERCENT_MAX})` };
}

/**
 * Builds the shareable URL of a course inside the tribe courses section.
 */
export function buildCourseHref(tribeSlug: string, courseId: string): string {
  return buildTribeCoursesRoute(tribeSlug, { courseId });
}

type TribeCoursesCatalogProps = {
  courses: CourseWithModulesResult[];
  /**
   * Opens a course inside the page. When provided, plain clicks on a card
   * call it instead of following the link; modified clicks still open the URL.
   */
  onCourseSelect?: (courseId: string) => void;
  /** Focuses the heading on mount, after an in-page navigation to the catalog. */
  revealHeadingOnMount?: boolean;
  tribeSlug: string;
  viewerPermissions: CourseTreeViewerPermissionsResult;
};

/**
 * Formats the lesson count with its singular or plural noun.
 *
 * @param lessonCount - Visible lessons in the course.
 * @returns Spanish lesson count label.
 */
function formatLessonCount(lessonCount: number): string {
  const suffix =
    lessonCount === 1
      ? CATALOG_COPY.lessonCountSuffixSingular
      : CATALOG_COPY.lessonCountSuffixPlural;

  return `${lessonCount} ${suffix}`;
}

/**
 * Link to the course catalog management page, shown to course managers.
 *
 * @param props - Tribe slug.
 * @returns Management link.
 */
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

/**
 * Catalog of the tribe courses with the viewer progress. Each card is a real,
 * shareable link to its course.
 *
 * @param props - Visible courses, in-page course selection, tribe slug and viewer permissions.
 * @returns Courses catalog page content.
 */
export function TribeCoursesCatalog({
  courses,
  onCourseSelect,
  revealHeadingOnMount = false,
  tribeSlug,
  viewerPermissions,
}: TribeCoursesCatalogProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useRevealViewHeadingOnMount(headingRef, revealHeadingOnMount);

  const handleCourseClick = (
    event: MouseEvent<HTMLAnchorElement>,
    courseId: string
  ) => {
    if (!onCourseSelect || !isInPageLinkClick(event)) {
      return;
    }

    event.preventDefault();
    onCourseSelect(courseId);
  };

  return (
    <main className={styles.TribeCoursesCatalog}>
      <header className={styles.TribeCoursesCatalog__header}>
        <h1
          className={styles.TribeCoursesCatalog__heading}
          ref={headingRef}
          tabIndex={-1}
        >
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
                  onClick={(event) => handleCourseClick(event, course.id)}
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
                      aria-label={CATALOG_COPY.progressLabel}
                      aria-valuemax={PERCENT_MAX}
                      aria-valuemin={0}
                      aria-valuenow={progressPercent}
                      className={styles.TribeCoursesCatalog__progressTrack}
                      role={PROGRESSBAR_ROLE}
                    >
                      <span
                        className={styles.TribeCoursesCatalog__progressFill}
                        style={buildProgressFillStyle(progressPercent)}
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
                      <ArrowRight
                        aria-hidden
                        className={styles.TribeCoursesCatalog__cardCtaIcon}
                      />
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
