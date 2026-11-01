"use client";
/** Shows what a policy write is doing, what blocked it, who resolves each block and how to continue, next to the action that started it. @module policy-action-feedback */
import { useState } from "react";
import { Button, toast } from "@golfo/ui";
import { Link } from "@/components/navigation/link";
import { openSitepingReport } from "@/lib/siteping/siteping-report-launcher";
import type { AdmissionPreflightReason } from "@/src/modules/academy-admissions/domain/policies/admission-activation-preflight";
import type { AdmissionPolicyActivationReason } from "@/src/modules/academy-admissions/domain/policies/admission-policy-activation";
import { ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY, ADMISSION_POLICY_BROWSER_COPY, ADMISSION_POLICY_DESTINATION_COPY, ADMISSION_POLICY_PLATFORM_COPY, ADMISSION_POLICY_PREFLIGHT_REASON_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_POLICY_BLOCK_RESOLUTION, ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON, ADMISSION_POLICY_FLOW_FAILURE_COPY, ADMISSION_POLICY_FLOW_STAGE_COPY, isAdmissionPolicyPlatformReason, type AdmissionPolicyBlockReason, type AdmissionPolicyFlowStage } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import styles from "./styles.module.scss";

/** Requirements found when a policy write was blocked, with what that write kept. */
export type AdmissionPolicyActivationBlock = {
  message: string;
  note: string;
  /** What the blocked write kept, read next to reasons only the TuTribu team can resolve; never claims a save that did not happen. */
  platformNote: string;
  preflightReasons: AdmissionPreflightReason[];
  requirements: AdmissionPolicyActivationReason[];
};
/** A definitive failure of one chained sub-step, retried from that sub-step. */
export type AdmissionPolicyFailure = { stage: AdmissionPolicyFlowStage; rulesSaved: boolean };
/** Pages where the leader resolves channel, quota, list and academy-mode requirements. */
export type AdmissionPolicySettingsLinks = { usage: string; connection: string; allowlist: string; academy: string };

type PolicyActionFeedbackProps = {
  stage: AdmissionPolicyFlowStage | null; errorMessage: string | null; failure: AdmissionPolicyFailure | null; activationBlock: AdmissionPolicyActivationBlock | null;
  links: AdmissionPolicySettingsLinks; busy: boolean; retrying: boolean;
  /** True while "Volver a comprobar" rereads the configuration and its requirements. */
  rechecking?: boolean;
  /** False while an uncertain original is pending: its own callout offers the read instead. */
  allowReload: boolean;
  onRetry: () => void; onReloadCurrent: () => void;
  /** Opens the contact step for requirements resolved there; omitted where that step is not on screen. */
  onReviewContact?: () => void;
  /** Rereads the configuration and checks the requirements again, without asking for another decision. */
  onRecheck?: () => void;
};

/** @param reasons - Reasons of one block. @returns Each reason once, in its original order. */
function unique(reasons: AdmissionPolicyBlockReason[]): AdmissionPolicyBlockReason[] {
  return [...new Set(reasons)];
}
/** @param reason - Preflight or activation reason. @returns Its plain-language explanation. */
function reasonCopy(reason: AdmissionPolicyBlockReason): string {
  return reason in ADMISSION_POLICY_PREFLIGHT_REASON_COPY ? ADMISSION_POLICY_PREFLIGHT_REASON_COPY[reason as AdmissionPreflightReason] : ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY[reason as AdmissionPolicyActivationReason];
}

type DestinationProps = Pick<PolicyActionFeedbackProps, "links" | "busy" | "rechecking" | "onReviewContact" | "onRecheck"> & { reason: AdmissionPolicyBlockReason; showRecheck: boolean };

/**
 * @param props - Reason, its destinations and the step openers.
 * @returns The way to resolve one reason the leader can act on.
 */
function BlockDestination({ reason, links, busy, rechecking, onReviewContact, onRecheck, showRecheck }: DestinationProps) {
  const resolution = ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[reason];
  if (resolution === ADMISSION_POLICY_BLOCK_RESOLUTION.usage) return <Link className={styles.PolicyActionFeedback__link} href={links.usage}>{ADMISSION_POLICY_DESTINATION_COPY.usage}</Link>;
  if (resolution === ADMISSION_POLICY_BLOCK_RESOLUTION.connection) return <Link className={styles.PolicyActionFeedback__link} href={links.connection}>{ADMISSION_POLICY_DESTINATION_COPY.connection}</Link>;
  if (resolution === ADMISSION_POLICY_BLOCK_RESOLUTION.academy) return <Link className={styles.PolicyActionFeedback__link} href={links.academy}>{ADMISSION_POLICY_DESTINATION_COPY.academy}</Link>;
  if (resolution === ADMISSION_POLICY_BLOCK_RESOLUTION.contactStep && onReviewContact) return <Button variant="ghost" size="sm" onClick={onReviewContact}>{ADMISSION_POLICY_DESTINATION_COPY.contactStep}</Button>;
  if (resolution === ADMISSION_POLICY_BLOCK_RESOLUTION.recheck && showRecheck && onRecheck) return <Button variant="ghost" size="sm" loading={rechecking} disabled={busy && !rechecking} onClick={onRecheck}>{ADMISSION_POLICY_DESTINATION_COPY.recheck}</Button>;
  return null;
}

/**
 * @param props - Platform reasons, what the blocked write kept and recovery actions.
 * @returns The callout for reasons only the TuTribu team can resolve, with a copyable diagnostic code, a recheck and a report.
 */
function PlatformBlock({ reasons, note, busy, rechecking, onRecheck }: { reasons: AdmissionPolicyBlockReason[]; note: string; busy: boolean; rechecking?: boolean; onRecheck?: () => void }) {
  const [reportUnavailable, setReportUnavailable] = useState(false);
  /** @param reason - Internal reason, which is neither secret nor personal data. */
  const copy = async (reason: string) => {
    try { await navigator.clipboard.writeText(reason); toast.success(ADMISSION_POLICY_PLATFORM_COPY.copied); }
    catch { toast.error(ADMISSION_POLICY_PLATFORM_COPY.copyFailed); }
  };
  return <div className={styles.PolicyActionFeedback__platform} role="group" aria-label={ADMISSION_POLICY_PLATFORM_COPY.title}>
    <p className={styles.PolicyActionFeedback__title}>{ADMISSION_POLICY_PLATFORM_COPY.title}</p>
    <p className={styles.PolicyActionFeedback__note}>{`${ADMISSION_POLICY_PLATFORM_COPY.explanation} ${note}`}</p>
    <ul className={styles.PolicyActionFeedback__reasons}>
      {reasons.map((reason) => <li key={reason}>
        <span className={styles.PolicyActionFeedback__reasonText}>{reasonCopy(reason)}</span>
        <span className={styles.PolicyActionFeedback__diagnostic}>{ADMISSION_POLICY_PLATFORM_COPY.diagnosticLabel}: <code className={styles.PolicyActionFeedback__code}>{reason}</code></span>
        <Button variant="ghost" size="sm" aria-label={`${ADMISSION_POLICY_PLATFORM_COPY.copy} ${reason}`} onClick={() => void copy(reason)}>{ADMISSION_POLICY_PLATFORM_COPY.copy}</Button>
      </li>)}
    </ul>
    <div className={styles.PolicyActionFeedback__actions}>
      {onRecheck && <Button variant="secondary" size="sm" loading={rechecking} disabled={busy && !rechecking} onClick={onRecheck}>{ADMISSION_POLICY_PLATFORM_COPY.recheck}</Button>}
      <Button variant="ghost" size="sm" onClick={() => setReportUnavailable(!openSitepingReport())}>{ADMISSION_POLICY_PLATFORM_COPY.report}</Button>
    </div>
    {reportUnavailable && <p role="status" className={styles.PolicyActionFeedback__note}>{ADMISSION_POLICY_PLATFORM_COPY.reportUnavailable}</p>}
  </div>;
}

/**
 * @param props - Running sub-step, blocking requirements, failure and recovery callbacks.
 * @returns Live progress, a requirements callout split by who resolves each reason, or a retryable error.
 */
export function PolicyActionFeedback(props: PolicyActionFeedbackProps) {
  const block = props.activationBlock;
  const reasons = block ? unique([...block.preflightReasons, ...block.requirements]) : [];
  const leaderReasons = reasons.filter((reason) => !isAdmissionPolicyPlatformReason(reason)), platformReasons = reasons.filter(isAdmissionPolicyPlatformReason);
  const firstRecheck = leaderReasons.find((reason) => ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[reason] === ADMISSION_POLICY_BLOCK_RESOLUTION.recheck);
  return <div className={styles.PolicyActionFeedback}>
    {/* A persistent live region, so assistive technology announces each sub-step as it changes. */}
    <p role="status" className={styles.PolicyActionFeedback__progress}>{props.stage ? ADMISSION_POLICY_FLOW_STAGE_COPY[props.stage] : ""}</p>
    {block && <section className={styles.PolicyActionFeedback__block} aria-label="Lo que falta resolver">
      <p role="alert" className={styles.PolicyActionFeedback__title}>{block.message}</p>
      {leaderReasons.length > 0 && <ul className={styles.PolicyActionFeedback__reasons}>
        {leaderReasons.map((reason) => <li key={reason}><span className={styles.PolicyActionFeedback__reasonText}>{reasonCopy(reason)}</span>
          <BlockDestination reason={reason} links={props.links} busy={props.busy} rechecking={props.rechecking} onReviewContact={props.onReviewContact}
            onRecheck={props.onRecheck} showRecheck={reason === firstRecheck && platformReasons.length === 0} /></li>)}
      </ul>}
      {platformReasons.length > 0 && <PlatformBlock reasons={platformReasons} note={block.platformNote} busy={props.busy} rechecking={props.rechecking} onRecheck={props.onRecheck} />}
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
