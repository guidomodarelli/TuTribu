/** Shows what a policy write is doing, what blocked it and how to continue, next to the action that started it. @module policy-action-feedback */
import { Button } from "@golfo/ui";
import { Link } from "@/components/navigation/link";
import type { AdmissionPreflightReason } from "@/src/modules/academy-admissions/domain/policies/admission-activation-preflight";
import type { AdmissionPolicyActivationReason } from "@/src/modules/academy-admissions/domain/policies/admission-policy-activation";
import { ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY, ADMISSION_POLICY_BROWSER_COPY, ADMISSION_POLICY_PREFLIGHT_REASON_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_POLICY_FLOW_FAILURE_COPY, ADMISSION_POLICY_FLOW_STAGE_COPY, ADMISSION_POLICY_REQUIREMENT_DESTINATION, ADMISSION_POLICY_REQUIREMENT_DESTINATION_BY_REASON, type AdmissionPolicyFlowStage } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import styles from "./styles.module.scss";

/** Requirements found when activating or resuming; the rules are already saved, so nothing chosen is lost. */
export type AdmissionPolicyActivationBlock = {
  message: string;
  note: string;
  preflightReasons: AdmissionPreflightReason[];
  requirements: AdmissionPolicyActivationReason[];
  unknownCommercialMemberCount: number;
  privilegedCommercialMemberCount: number;
};
/** A definitive failure of one chained sub-step, retried from that sub-step. */
export type AdmissionPolicyFailure = { stage: AdmissionPolicyFlowStage; rulesSaved: boolean };
/** Pages where the leader resolves channel and quota requirements. */
export type AdmissionPolicySettingsLinks = { usage: string; connection: string; allowlist: string };

type PolicyActionFeedbackProps = {
  stage: AdmissionPolicyFlowStage | null; errorMessage: string | null; failure: AdmissionPolicyFailure | null; activationBlock: AdmissionPolicyActivationBlock | null;
  links: AdmissionPolicySettingsLinks; busy: boolean; retrying: boolean;
  /** False while an uncertain original is pending: its own callout offers the read instead. */
  allowReload: boolean;
  onRetry: () => void; onReloadCurrent: () => void;
  /** Opens the contact step for requirements resolved there; omitted where that step is not on screen. */
  onReviewContact?: () => void;
};

/**
 * @param props - Requirement, its destinations and the contact step opener.
 * @returns The way to resolve one requirement, or nothing when the platform team resolves it.
 */
function RequirementDestination({ requirement, links, onReviewContact }: { requirement: AdmissionPolicyActivationReason; links: AdmissionPolicySettingsLinks; onReviewContact?: () => void }) {
  const destination = ADMISSION_POLICY_REQUIREMENT_DESTINATION_BY_REASON[requirement];
  if (destination === ADMISSION_POLICY_REQUIREMENT_DESTINATION.usage) return <Link className={styles.PolicyActionFeedback__link} href={links.usage}>Ir a Países y cupos</Link>;
  if (destination === ADMISSION_POLICY_REQUIREMENT_DESTINATION.connection) return <Link className={styles.PolicyActionFeedback__link} href={links.connection}>Ir a Conexión</Link>;
  if (destination === ADMISSION_POLICY_REQUIREMENT_DESTINATION.contactStep && onReviewContact) return <Button variant="ghost" size="sm" onClick={onReviewContact}>Revisar «Cómo se contactan»</Button>;
  return null;
}

/**
 * @param props - Running sub-step, blocking requirements, failure and recovery callbacks.
 * @returns Live progress, a requirements callout with links, or a retryable error.
 */
export function PolicyActionFeedback(props: PolicyActionFeedbackProps) {
  const block = props.activationBlock;
  return <div className={styles.PolicyActionFeedback}>
    {/* A persistent live region, so assistive technology announces each sub-step as it changes. */}
    <p role="status" className={styles.PolicyActionFeedback__progress}>{props.stage ? ADMISSION_POLICY_FLOW_STAGE_COPY[props.stage] : ""}</p>
    {block && <section className={styles.PolicyActionFeedback__block} aria-label="Lo que falta resolver">
      <p role="alert" className={styles.PolicyActionFeedback__title}>{block.message}</p>
      {(block.preflightReasons.length > 0 || block.requirements.length > 0) && <ul className={styles.PolicyActionFeedback__reasons}>
        {block.preflightReasons.map((reason) => <li key={reason}>{ADMISSION_POLICY_PREFLIGHT_REASON_COPY[reason]}</li>)}
        {block.requirements.map((requirement) => <li key={requirement}><span className={styles.PolicyActionFeedback__reasonText}>{ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY[requirement]}</span><RequirementDestination requirement={requirement} links={props.links} onReviewContact={props.onReviewContact} /></li>)}
      </ul>}
      {block.unknownCommercialMemberCount > 0 && <p className={styles.PolicyActionFeedback__note}>Membresías con historial comercial desconocido: {block.unknownCommercialMemberCount}.</p>}
      {block.privilegedCommercialMemberCount > 0 && <p className={styles.PolicyActionFeedback__note}>Membresías comerciales restringidas con rol de líder o guardián: {block.privilegedCommercialMemberCount}.</p>}
      <p className={styles.PolicyActionFeedback__note}>{block.note}</p>
    </section>}
    {props.errorMessage && <div role="alert" className={styles.PolicyActionFeedback__recovery}>
      <p className={styles.PolicyActionFeedback__error}>{props.failure ? `${ADMISSION_POLICY_FLOW_FAILURE_COPY[props.failure.stage]} ${props.errorMessage}` : props.errorMessage}</p>
      {props.failure?.rulesSaved && <p className={styles.PolicyActionFeedback__note}>{ADMISSION_POLICY_BROWSER_COPY.rulesKept}</p>}
      {props.failure
        ? <Button variant="secondary" size="sm" loading={props.retrying} disabled={props.busy && !props.retrying} onClick={props.onRetry}>Reintentar</Button>
        : props.allowReload && <Button variant="secondary" size="sm" disabled={props.busy} onClick={props.onReloadCurrent}>Consultar configuración actual</Button>}
    </div>}
  </div>;
}
