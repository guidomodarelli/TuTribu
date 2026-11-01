/*
 * Contains code adapted from Arc Pro (https://uiarc.dev), licensed under the
 * Arc Pro license (https://uiarc.dev/license). Not covered by this project's
 * license; do not redistribute it on its own.
 *
 * Adapted from the Arc "Release readiness" block: the checks come from the
 * server instead of checkboxes, the single final action is a link to the next
 * settings page, copy is in Spanish and styles are a BEM SCSS module. It renders
 * on the server; only the shared platform notice hydrates, for its copy and report actions.
 */

import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { ButtonLink } from "@/components/navigation/link";
import { PlatformSecurityNotice } from "@/components/academy-admissions/platform-security-notice";
import { ROUTES } from "@/src/constants/routes";
import type { AdmissionSetupProgress } from "@/src/modules/academy-admissions/application/queries/admission-setup-progress";
import { ADMISSION_SETUP_GUIDE_COPY as COPY, ADMISSION_SETUP_PLATFORM_COPY, ADMISSION_SETUP_STEP, ADMISSION_SETUP_STEP_COPY as STEP_COPY, ADMISSION_SETUP_STEP_POLICY_ENTRY, ADMISSION_SETUP_STEP_SEGMENT, ADMISSION_SETUP_STEP_STATUS as STATUS, type AdmissionSetupStepId } from "@/src/modules/academy-admissions/constants/admission-setup-guide";
import { admissionPolicyStepHref } from "@/src/modules/academy-admissions/constants/admission-settings-navigation";
import styles from "./styles.module.scss";

export type AdmissionSetupGuideProps = { slug: string; progress: AdmissionSetupProgress };

/** Share of the bar that stays empty once every required step is done. */
const PERCENT = 100;

type SetupStep = AdmissionSetupProgress["steps"][number];

/**
 * Draft rules open the final rules step; other steps open their page.
 *
 * @param slug - Tribe slug. @param id - Setup step. @param draft - Whether the rules are an unpublished draft.
 * @returns The page that completes the step.
 */
function setupStepHref(slug: string, id: AdmissionSetupStepId, draft: boolean): string {
  const entry = id === ADMISSION_SETUP_STEP.open && draft ? ADMISSION_SETUP_STEP_POLICY_ENTRY[id] : null;
  return entry ? admissionPolicyStepHref(slug, entry) : `/${encodeURIComponent(slug)}/${ADMISSION_SETUP_STEP_SEGMENT[id]}`;
}

/** @param step - One derived setup step. @returns Why the opening step is not done yet, or null for any other reason. */
function openStepDetail(step: SetupStep): string | null {
  if (step.id !== ADMISSION_SETUP_STEP.open) return null;
  /** A draft is mentioned only when rules were saved: without them the opening step has nothing kept. */
  if (step.platformBlocked) return step.draft ? STEP_COPY.open.platformBlocked : STEP_COPY.open.platformBlockedUnsaved;
  if (step.admissionsClosed) return STEP_COPY.open.admissionsClosed;
  return step.paused ? STEP_COPY.open.paused : null;
}

/** @param step - One derived setup step. @returns The line under the step title: what is done, what blocks it or what is pending. */
function setupStepDetail(step: SetupStep): string {
  const copy = STEP_COPY[step.id];
  if (step.status === STATUS.done) return step.lowNoticeQuota ? STEP_COPY.usage.lowQuota : copy.done;
  const openDetail = openStepDetail(step);
  if (openDetail !== null) return openDetail;
  if (step.emailOmitted) return STEP_COPY.notifications.omitted;
  return step.status === STATUS.optional && "optional" in copy ? copy.optional : copy.pending;
}

/** @param props - Step state and its position among the required steps. @returns A check when done, a dot when optional, or its number. */
function SetupStepMarker({ done, optional, number }: { done: boolean; optional: boolean; number: number | undefined }) {
  if (done) return <CheckIcon className={styles.AdmissionSetupGuide__check} />;
  return optional ? "·" : number;
}

/**
 * @param props - One derived step, the tribe slug, whether it is the next step, its required-step number and whether steps may link
 * to their page (never while the platform cannot protect admission writes).
 * @returns The checklist row with its badges, detail and, when next, its action.
 */
function SetupStepItem({ step, slug, isNext, number, actionable }: { step: SetupStep; slug: string; isNext: boolean; number: number | undefined; actionable: boolean }) {
  const offersAction = isNext && actionable;
  const copy = STEP_COPY[step.id];
  const done = step.status === STATUS.done;
  const optional = step.status === STATUS.optional;
  return (
    <li className={`${styles.AdmissionSetupGuide__step} ${done ? styles["AdmissionSetupGuide__step--done"] : ""} ${isNext ? styles["AdmissionSetupGuide__step--next"] : ""}`} aria-current={isNext ? "step" : undefined}>
      <span className={styles.AdmissionSetupGuide__marker} aria-hidden="true"><SetupStepMarker done={done} optional={optional} number={number} /></span>
      <div className={styles.AdmissionSetupGuide__copy}>
        <span className={styles.AdmissionSetupGuide__stepTitle}>
          {copy.title}
          {step.draft ? <span className={styles.AdmissionSetupGuide__badge}>{COPY.draftBadge}</span> : done && <span className={`${styles.AdmissionSetupGuide__badge} ${step.lowNoticeQuota ? styles["AdmissionSetupGuide__badge--warning"] : ""}`}>{step.lowNoticeQuota ? COPY.lowQuotaBadge : COPY.doneBadge}</span>}
          {step.emailOmitted && <span className={`${styles.AdmissionSetupGuide__badge} ${styles["AdmissionSetupGuide__badge--warning"]}`}>{COPY.emailOmittedBadge}</span>}
          {step.platformBlocked && <span className={styles.AdmissionSetupGuide__badge}>{COPY.platformBadge}</span>}
          {step.admissionsClosed && <span className={`${styles.AdmissionSetupGuide__badge} ${styles["AdmissionSetupGuide__badge--warning"]}`}>{COPY.admissionsClosedBadge}</span>}
          {optional && <span className={styles.AdmissionSetupGuide__badge}>{COPY.optionalBadge}</span>}
        </span>
        <span className={styles.AdmissionSetupGuide__detail}>{setupStepDetail(step)}</span>
      </div>
      {offersAction && step.admissionsClosed && <ButtonLink className={styles.AdmissionSetupGuide__action} href={ROUTES.tribes.academyManage(slug)} variant="primary" size="sm">{STEP_COPY.open.academyAction}<ArrowRightIcon aria-hidden="true" /></ButtonLink>}
      {offersAction && !step.platformBlocked && !step.admissionsClosed && <ButtonLink className={styles.AdmissionSetupGuide__action} href={setupStepHref(slug, step.id, Boolean(step.draft))} variant="primary" size="sm">{copy.action}<ArrowRightIcon aria-hidden="true" /></ButtonLink>}
    </li>
  );
}

/**
 * Shows the leader's setup as a short ordered checklist with one next action; while the platform cannot protect admission writes,
 * a single «Depende del equipo de TuTribu» notice replaces that action.
 *
 * @param props - Tribe slug for the links and the derived setup progress.
 * @returns Nothing once every step is done; otherwise the checklist.
 */
export function AdmissionSetupGuide({ slug, progress }: AdmissionSetupGuideProps) {
  if (progress.next === null) return null;
  const ratio = progress.required === 0 ? 1 : progress.completed / progress.required;
  const allRequiredDone = progress.completed === progress.required;
  const numbers = new Map(progress.steps.filter((step) => step.status !== STATUS.optional).map((step, index) => [step.id, index + 1]));

  return (
    <section className={styles.AdmissionSetupGuide} aria-labelledby="admission-setup-guide-title">
      <header className={styles.AdmissionSetupGuide__header}>
        <h2 id="admission-setup-guide-title" className={styles.AdmissionSetupGuide__title}>{COPY.title}</h2>
        <p className={styles.AdmissionSetupGuide__description}>{COPY.description}</p>
      </header>

      {progress.platformSecurity && <div className={styles.AdmissionSetupGuide__platform}>
        <PlatformSecurityNotice requirement={progress.platformSecurity.requirement} consequence={progress.platformSecurity.rulesSaved ? ADMISSION_SETUP_PLATFORM_COPY.saved : ADMISSION_SETUP_PLATFORM_COPY.unsaved} />
      </div>}

      <div className={styles.AdmissionSetupGuide__progress}>
        <div className={styles.AdmissionSetupGuide__progressMeta}>
          <span>{allRequiredDone ? "Lo necesario está listo" : `${progress.completed} de ${progress.required} pasos necesarios listos`}</span>
        </div>
        <div className={styles.AdmissionSetupGuide__track} role="progressbar" aria-label={COPY.progressLabel} aria-valuemin={0} aria-valuemax={progress.required} aria-valuenow={progress.completed}>
          <span className={`${styles.AdmissionSetupGuide__fill} ${allRequiredDone ? styles["AdmissionSetupGuide__fill--complete"] : ""}`} style={{ transform: `translateX(${(ratio - 1) * PERCENT}%)` }} />
        </div>
      </div>

      <ol className={styles.AdmissionSetupGuide__steps} aria-label={COPY.listLabel}>
        {progress.steps.map((step) => <SetupStepItem key={step.id} step={step} slug={slug} isNext={step.id === progress.next} number={numbers.get(step.id)} actionable={!progress.platformSecurity} />)}
      </ol>
    </section>
  );
}
