/** Loading shell of a personal invitation: its real heading, then placeholders shaped like the confirmation. @module personal-invitation-loading */
import { RouteSkeleton, SkeletonActions, SkeletonBlock, SkeletonLines } from "@/components/loaders/route-skeleton";
import { PERSONAL_INVITATION_UI_COPY } from "@/src/modules/academy-admissions/constants/personal-invitation-ui";
import styles from "./styles.module.scss";

/** The safe message and the allowlist note take about three lines, followed by the single confirm action. */
const PERSONAL_INVITATION_LOADING_SHAPE = { messageLineCount: 3, actionCount: 1 } as const;

/**
 * @returns The invitation's eyebrow, title and description, with placeholders for the safe message, the confirmation and
 * its action; it reads no token, session or clock and renders no control that could submit.
 */
export function PersonalInvitationLoading() {
  return <main className={styles.PersonalInvitationLoading}>
    <header className={styles.PersonalInvitationLoading__header}>
      <p className={styles.PersonalInvitationLoading__eyebrow}>{PERSONAL_INVITATION_UI_COPY.eyebrow}</p>
      <h1 className={styles.PersonalInvitationLoading__title}>{PERSONAL_INVITATION_UI_COPY.title}</h1>
      <p className={styles.PersonalInvitationLoading__description}>{PERSONAL_INVITATION_UI_COPY.description}</p>
    </header>
    <RouteSkeleton label={PERSONAL_INVITATION_UI_COPY.title} status={PERSONAL_INVITATION_UI_COPY.loading}>
      <SkeletonLines count={PERSONAL_INVITATION_LOADING_SHAPE.messageLineCount} />
      <span aria-hidden="true" className={styles.PersonalInvitationLoading__confirmation}>
        <SkeletonBlock kind="marker" />
        <SkeletonBlock kind="text" width="long" />
      </span>
      <SkeletonActions count={PERSONAL_INVITATION_LOADING_SHAPE.actionCount} />
    </RouteSkeleton>
  </main>;
}
