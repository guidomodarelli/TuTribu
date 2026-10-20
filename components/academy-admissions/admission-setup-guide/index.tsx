/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the
 * Arc Pro license (https://uiarc.dev/license). Not covered by this project's
 * license; do not redistribute it on its own.
 *
 * Adapted from the Arc "Release readiness" block: the checks come from the
 * server instead of checkboxes, the single final action is a link to the next
 * settings page, copy is in Spanish and styles are a BEM SCSS module. It renders
 * on the server and needs no client JavaScript.
 */

import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { ButtonLink } from "@/components/navigation/link";
import type { AdmissionSetupProgress } from "@/src/modules/academy-admissions/application/queries/admission-setup-progress";
import { ADMISSION_SETUP_GUIDE_COPY as COPY, ADMISSION_SETUP_STEP, ADMISSION_SETUP_STEP_COPY as STEP_COPY, ADMISSION_SETUP_STEP_POLICY_ENTRY, ADMISSION_SETUP_STEP_SEGMENT, ADMISSION_SETUP_STEP_STATUS as STATUS, type AdmissionSetupStepId } from "@/src/modules/academy-admissions/constants/admission-setup-guide";
import { admissionPolicyStepHref } from "@/src/modules/academy-admissions/constants/admission-settings-navigation";
import styles from "./styles.module.scss";

export type AdmissionSetupGuideProps = { slug: string; progress: AdmissionSetupProgress };

/** Share of the bar that stays empty once every required step is done. */
const PERCENT = 100;

/**
 * Shows the leader's setup as a short ordered checklist with one next action.
 *
 * @param props - Tribe slug for the links and the derived setup progress.
 * @returns Nothing once every step is done; otherwise the checklist.
 */
export function AdmissionSetupGuide({ slug, progress }: AdmissionSetupGuideProps) {
  if (progress.next === null) return null;
  /** Draft rules and the membership review open the exact rules step; other steps open their page. */
  const href = (id: AdmissionSetupStepId, draft: boolean) => {
    const entry = id === ADMISSION_SETUP_STEP.memberships || (id === ADMISSION_SETUP_STEP.open && draft) ? ADMISSION_SETUP_STEP_POLICY_ENTRY[id] : null;
    return entry ? admissionPolicyStepHref(slug, entry) : `/${encodeURIComponent(slug)}/${ADMISSION_SETUP_STEP_SEGMENT[id]}`;
  };
  const ratio = progress.required === 0 ? 1 : progress.completed / progress.required;
  const allRequiredDone = progress.completed === progress.required;
  const numbers = new Map(progress.steps.filter((step) => step.status !== STATUS.optional).map((step, index) => [step.id, index + 1]));

  return (
    <section className={styles.AdmissionSetupGuide} aria-labelledby="admission-setup-guide-title">
      <header className={styles.AdmissionSetupGuide__header}>
        <h2 id="admission-setup-guide-title" className={styles.AdmissionSetupGuide__title}>{COPY.title}</h2>
        <p className={styles.AdmissionSetupGuide__description}>{COPY.description}</p>
      </header>

      <div className={styles.AdmissionSetupGuide__progress}>
        <div className={styles.AdmissionSetupGuide__progressMeta}>
          <span>{allRequiredDone ? "Lo necesario está listo" : `${progress.completed} de ${progress.required} pasos necesarios listos`}</span>
        </div>
        <div className={styles.AdmissionSetupGuide__track} role="progressbar" aria-label={COPY.progressLabel} aria-valuemin={0} aria-valuemax={progress.required} aria-valuenow={progress.completed}>
          <span className={`${styles.AdmissionSetupGuide__fill} ${allRequiredDone ? styles["AdmissionSetupGuide__fill--complete"] : ""}`} style={{ transform: `translateX(${(ratio - 1) * PERCENT}%)` }} />
        </div>
      </div>

      <ol className={styles.AdmissionSetupGuide__steps} aria-label={COPY.listLabel}>
        {progress.steps.map((step) => {
          const copy = STEP_COPY[step.id];
          const done = step.status === STATUS.done;
          const optional = step.status === STATUS.optional;
          const isNext = step.id === progress.next;
          const detail = done ? copy.done
            : step.id === ADMISSION_SETUP_STEP.open && step.platformBlocked ? STEP_COPY.open.platformBlocked
            : step.id === ADMISSION_SETUP_STEP.open && step.paused ? STEP_COPY.open.paused
            : optional && "optional" in copy ? copy.optional : copy.pending;
          return (
            <li key={step.id} className={`${styles.AdmissionSetupGuide__step} ${done ? styles["AdmissionSetupGuide__step--done"] : ""} ${isNext ? styles["AdmissionSetupGuide__step--next"] : ""}`} aria-current={isNext ? "step" : undefined}>
              <span className={styles.AdmissionSetupGuide__marker} aria-hidden="true">{done ? <CheckIcon className={styles.AdmissionSetupGuide__check} /> : optional ? "·" : numbers.get(step.id)}</span>
              <div className={styles.AdmissionSetupGuide__copy}>
                <span className={styles.AdmissionSetupGuide__stepTitle}>
                  {copy.title}
                  {step.draft ? <span className={styles.AdmissionSetupGuide__badge}>{COPY.draftBadge}</span> : done && <span className={styles.AdmissionSetupGuide__badge}>{COPY.doneBadge}</span>}
                  {step.platformBlocked && <span className={styles.AdmissionSetupGuide__badge}>{COPY.platformBadge}</span>}
                  {optional && <span className={styles.AdmissionSetupGuide__badge}>{COPY.optionalBadge}</span>}
                </span>
                <span className={styles.AdmissionSetupGuide__detail}>{detail}</span>
              </div>
              {isNext && !step.platformBlocked && <ButtonLink className={styles.AdmissionSetupGuide__action} href={href(step.id, Boolean(step.draft))} variant="primary" size="sm">{copy.action}<ArrowRightIcon aria-hidden="true" /></ButtonLink>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
