"use client";
/** Renders admission rules as a guided flow or, once activated, as a simple open/paused status, from current props without session or HTTP dependencies. @module admission-policy-form */
import { Badge, Button, Checkbox, type BadgeTone } from "@golfo/ui";
import { useId } from "react";
import type { AdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-draft";
import type { AdmissionPolicyStateDto } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { ADMISSION_POLICY_PUBLIC_STATE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_POLICY_BROWSER_COPY, ADMISSION_POLICY_DRAFT_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_POLICY_ACTION, ADMISSION_POLICY_STEP, type AdmissionPolicyAction, type AdmissionPolicyFlowStage } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import { PolicyActionFeedback, type AdmissionPolicyActivationBlock, type AdmissionPolicyFailure, type AdmissionPolicySettingsLinks } from "./policy-action-feedback";
import { PolicyRulesSteps, admissionPolicyStepIds, type PolicyMembershipStep } from "./policy-rules-steps";
import { PolicyStatusPanel } from "./policy-status-panel";
import styles from "./styles.module.scss";

export type { AdmissionPolicyActivationBlock, AdmissionPolicyFailure, AdmissionPolicySettingsLinks } from "./policy-action-feedback";
export type { PolicyMembershipStep } from "./policy-rules-steps";
export { admissionPolicyStepIds } from "./policy-rules-steps";

/** Preparation and safe messages come from the route container; they are never authority supplied by a form. */
export type AdmissionPolicyFormProps = {
  state: AdmissionPolicyStateDto; draft: AdmissionPolicyDraft;
  /** Saved rules of the current configuration, shown by the status view. */
  savedRules: AdmissionPolicyDraft;
  /** True while an activated control is being edited through the guided flow. */
  editing: boolean; step: number; confirmed: boolean;
  /** Any read or write in flight; controls are disabled but their labels never change. */
  busy: boolean; stage: AdmissionPolicyFlowStage | null; pendingAction: AdmissionPolicyAction | null;
  validationMessage: string | null; statusMessage: string | null; errorMessage: string | null;
  failure: AdmissionPolicyFailure | null; activationBlock: AdmissionPolicyActivationBlock | null;
  /** Only an actual role or permission denial shows the leader-only notice. */
  permissionDenied: boolean; links: AdmissionPolicySettingsLinks;
  pauseOpen: boolean; pauseReason: string;
  uncertain: boolean; canRetryOriginal: boolean; retryConfirmed: boolean;
  onChange: (draft: AdmissionPolicyDraft) => void; onStepChange: (step: number) => void; onConfirm: (confirmed: boolean) => void; onRunFinal: () => void;
  onEdit: () => void; onCancelEdit: () => void; onPauseOpen: (open: boolean) => void; onPauseReason: (reason: string) => void; onPause: () => void; onResume: () => void;
  onRetry: () => void; onReloadCurrent: () => void; onRetryConfirm: (confirmed: boolean) => void; onRetryOriginal: () => void;
  /** Membership review step inserted before the final step; null when no membership needs a decision. */
  membershipStep?: PolicyMembershipStep | null;
  /** Final action label override while saved rules are being published. */
  finalLabel?: string;
  /** A reason only the TuTribu team can resolve is known: the draft notice explains it instead of offering to publish. */
  platformBlocked?: boolean;
  rechecking?: boolean;
  /** Opens the final step with the saved rules, to publish them. */
  onReviewDraft?: () => void;
  /** Opens the membership review step. */
  onReviewCommercial?: () => void;
  /** Rereads the configuration and checks the requirements again. */
  onRecheck?: () => void;
};

/** Badge copy and tone for each public lifecycle state. */
const STATE_BADGE = {
  [ADMISSION_POLICY_PUBLIC_STATE.notConfigured]: { label: "Admisiones sin activar", tone: "neutral" },
  [ADMISSION_POLICY_PUBLIC_STATE.draft]: { label: "Admisiones sin activar", tone: "neutral" },
  [ADMISSION_POLICY_PUBLIC_STATE.active]: { label: "Admisiones abiertas", tone: "success" },
  [ADMISSION_POLICY_PUBLIC_STATE.paused]: { label: "Admisiones pausadas", tone: "warning" },
  [ADMISSION_POLICY_PUBLIC_STATE.unavailable]: { label: "Requiere revisión", tone: "danger" },
} as const satisfies Record<AdmissionPolicyStateDto["state"], { label: string; tone: BadgeTone }>;

/**
 * @param props - Current safe state, retained draft, active step, write state and validated container callbacks.
 * @returns The current state summary, then either the guided rules flow or the open/paused status with its actions.
 */
export function AdmissionPolicyForm(props: AdmissionPolicyFormProps) {
  const editorTitleId = useId(), retryId = useId();
  const unavailable = props.state.state === ADMISSION_POLICY_PUBLIC_STATE.unavailable;
  const showStatus = props.state.controlActivated && !props.editing;
  const badge = STATE_BADGE[props.state.state];
  const pending = props.state.impact.pendingRequestCount;
  const lockedReason = unavailable ? ADMISSION_POLICY_BROWSER_COPY.unavailable : props.uncertain ? ADMISSION_POLICY_BROWSER_COPY.originalPending : null;
  const stepIds = admissionPolicyStepIds(props.editing, Boolean(props.membershipStep));
  const contactStep = stepIds.indexOf(ADMISSION_POLICY_STEP.contact), finalStep = stepIds.length - 1;
  const draftUnpublished = Boolean(props.state.policy) && !props.state.controlActivated && !unavailable;
  const feedback = <PolicyActionFeedback stage={props.stage} errorMessage={props.errorMessage} failure={props.failure} activationBlock={props.activationBlock} links={props.links} busy={props.busy} allowReload={!props.uncertain}
    retrying={props.pendingAction === ADMISSION_POLICY_ACTION.retry} rechecking={props.rechecking} onRetry={props.onRetry} onReloadCurrent={props.onReloadCurrent} onRecheck={props.onRecheck}
    onReviewContact={showStatus ? undefined : () => props.onStepChange(contactStep)} onReviewCommercial={showStatus ? undefined : props.onReviewCommercial} />;

  return <div className={styles.AdmissionPolicyForm} aria-busy={props.busy}>
    <section className={styles.AdmissionPolicyForm__summary} aria-label="Estado actual">
      <ul className={styles.AdmissionPolicyForm__badges}>
        <li><Badge tone={badge.tone}>{badge.label}</Badge></li>
        <li><Badge tone="neutral">{pending === 1 ? "1 solicitud pendiente" : `${pending} solicitudes pendientes`}</Badge></li>
      </ul>
      {!props.state.controlActivated && !unavailable && !props.state.policy && <p className={styles.AdmissionPolicyForm__lead}>Todavía no hay reglas de admisión. Completá los pasos: al final guardamos las reglas y activamos las admisiones en una sola acción.</p>}
      {draftUnpublished && <div className={styles.AdmissionPolicyForm__draft} role="group" aria-label={ADMISSION_POLICY_DRAFT_COPY.title}>
        <p className={styles.AdmissionPolicyForm__draftTitle}>{ADMISSION_POLICY_DRAFT_COPY.title}</p>
        <p className={styles.AdmissionPolicyForm__lead}>{props.platformBlocked ? ADMISSION_POLICY_DRAFT_COPY.platformBlocked : ADMISSION_POLICY_DRAFT_COPY.description}</p>
        {!props.platformBlocked && props.onReviewDraft && props.step !== finalStep && <Button variant="secondary" size="sm" disabled={props.busy || props.uncertain} onClick={props.onReviewDraft}>{ADMISSION_POLICY_DRAFT_COPY.action}</Button>}
      </div>}
      {props.permissionDenied && <p role="alert" className={`${styles.AdmissionPolicyForm__feedback} ${styles["AdmissionPolicyForm__feedback--alert"]}`}>{ADMISSION_POLICY_BROWSER_COPY.permissionDenied}</p>}
      {unavailable && <p role="alert" className={`${styles.AdmissionPolicyForm__feedback} ${styles["AdmissionPolicyForm__feedback--alert"]}`}>{ADMISSION_POLICY_BROWSER_COPY.unavailable}</p>}
      {props.statusMessage && <p role="status" className={styles.AdmissionPolicyForm__feedback}>{props.statusMessage}</p>}
    </section>

    {props.uncertain && <section className={styles.AdmissionPolicyForm__recovery} aria-label="Recuperar operación original">
      <p role="status">{ADMISSION_POLICY_BROWSER_COPY.uncertain}</p>
      <Button variant="secondary" disabled={props.busy} onClick={props.onReloadCurrent}>Consultar operación original</Button>
      {props.canRetryOriginal && <>
        <Checkbox id={retryId} checked={props.retryConfirmed} disabled={props.busy} label="Confirmo reintentar la misma operación con sus datos originales." onCheckedChange={(checked) => props.onRetryConfirm(checked === true)} />
        <Button loading={props.pendingAction === ADMISSION_POLICY_ACTION.original} disabled={!props.retryConfirmed || (props.busy && props.pendingAction !== ADMISSION_POLICY_ACTION.original)} onClick={props.onRetryOriginal}>Reintentar operación original</Button>
      </>}
    </section>}

    {!unavailable && (showStatus
      ? <PolicyStatusPanel rules={props.savedRules} busy={props.busy} locked={props.uncertain} pendingAction={props.pendingAction} pauseOpen={props.pauseOpen} pauseReason={props.pauseReason} feedback={feedback}
        onPauseOpen={props.onPauseOpen} onPauseReason={props.onPauseReason} onPause={props.onPause} onResume={props.onResume} onEdit={props.onEdit} />
      : <section className={styles.AdmissionPolicyForm__editor} aria-labelledby={editorTitleId}>
        <div className={styles.AdmissionPolicyForm__editorHeading}>
          <h2 id={editorTitleId} className={styles.AdmissionPolicyForm__title}>{props.editing ? "Editar reglas" : "Configurar admisiones"}</h2>
          {props.editing && <Button variant="ghost" size="sm" disabled={props.busy} onClick={props.onCancelEdit}>Cancelar edición</Button>}
        </div>
        <PolicyRulesSteps state={props.state} draft={props.draft} editing={props.editing} step={props.step} confirmed={props.confirmed} busy={props.busy} finalLoading={props.pendingAction === ADMISSION_POLICY_ACTION.final}
          lockedReason={lockedReason} validationMessage={props.validationMessage} links={props.links} feedback={feedback} membershipStep={props.editing ? null : props.membershipStep} finalLabel={props.finalLabel}
          onChange={props.onChange} onStepChange={props.onStepChange} onConfirm={props.onConfirm} onRunFinal={props.onRunFinal} />
      </section>)}
  </div>;
}
