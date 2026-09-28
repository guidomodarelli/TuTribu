"use client";

import { Button } from "beez-ui";

import { Link } from "@/components/navigation/link";
import { ROUTES } from "@/src/constants/routes";
import styles from "./styles.module.scss";

const LOCKED_COURSE_COPY = {
  academyLink: "Ver la academia",
  backButton: "Todos los cursos",
  description:
    "Este curso es parte de la academia. Tu cuenta y tu progreso siguen guardados.",
} as const;

type LockedAcademyCourseNoticeProps = {
  courseTitle: string;
  onBackToCatalog: () => void;
  tribeSlug: string;
};

/**
 * Safe view of a direct link to an academy course the viewer cannot open. It
 * only shows the title and the reason; the course content never reaches the
 * client.
 *
 * @param props - Course title, catalog navigation and tribe slug.
 * @returns Locked course notice.
 */
export function LockedAcademyCourseNotice({
  courseTitle,
  onBackToCatalog,
  tribeSlug,
}: LockedAcademyCourseNoticeProps) {
  return (
    <main className={styles.LockedAcademyCourseNotice}>
      <h1 className={styles.LockedAcademyCourseNotice__heading}>{courseTitle}</h1>
      <p className={styles.LockedAcademyCourseNotice__description}>
        {LOCKED_COURSE_COPY.description}
      </p>
      <div className={styles.LockedAcademyCourseNotice__actions}>
        <Link
          className={styles.LockedAcademyCourseNotice__academyLink}
          href={ROUTES.tribes.academy(tribeSlug)}
        >
          {LOCKED_COURSE_COPY.academyLink}
        </Link>
        <Button onClick={onBackToCatalog} type="button" variant="outline">
          {LOCKED_COURSE_COPY.backButton}
        </Button>
      </div>
    </main>
  );
}
