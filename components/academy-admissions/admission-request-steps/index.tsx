"use client";
/** Guides the applicant through the request data, the contact code and the final submission, one decision per step. @module admission-request-steps */
import type { ReactNode } from "react";
import { GuidedSteps, type GuidedStep, type GuidedStepsAction } from "@/components/forms/guided-steps";
import { AdmissionForm, type AdmissionFormProps } from "@/components/academy-admissions/admission-form";
import { ContactVerification, ContactVerificationResendActions, contactVerificationAvailability, type ContactVerificationProps } from "@/components/academy-admissions/contact-verification";
import { ADMISSION_REQUEST_FLOW_COPY as COPY, ADMISSION_REQUEST_FLOW_MODE, type AdmissionRequestFlowMode } from "@/src/modules/academy-admissions/constants/admission-request-flow";
import styles from "./styles.module.scss";

export type AdmissionRequestStepsProps = {
  /** `submit` presents a new request; `apply` attaches a checked contact to the applicant's pending request. */
  mode: AdmissionRequestFlowMode;
  /** Request data and its final consent; the flow submits, so the form never renders its own button. */
  form: Omit<AdmissionFormProps, "layout" | "onSubmit" | "hideContact">;
  /** Contact verification facts, or null when the academy does not ask for a code. */
  verification: ContactVerificationProps | null;
  /** True while the code is being sent, checked or applied, so only that step's button shows progress. */
  issuing: boolean; verifying: boolean;
  /** Reads that recover an unconfirmed code operation or its delivery; kept collapsed on the code step. */
  recovery?: ReactNode;
  step: number; onStepChange: (step: number) => void;
  busy: boolean;
  /** The last step's write: submitting the request, or applying the checked code to the pending one. */
  finalAction: GuidedStepsAction;
  /** Why the data step cannot continue yet, such as a required or invalid WhatsApp number. */
  detailsBlockedReason?: string;
  /** Why the last step cannot run yet, when the reason is not the missing consent. */
  finalBlockedReason?: string;
};

/** @param props - Controlled request draft, verification facts and the flow's writes. @returns The guided request flow. */
export function AdmissionRequestSteps(props: AdmissionRequestStepsProps) {
  const { form, verification } = props, submitting = props.mode === ADMISSION_REQUEST_FLOW_MODE.submit;
  const availability = verification ? contactVerificationAvailability(verification) : null;
  const steps: GuidedStep[] = [];

  if (submitting) steps.push({
    id: "details", title: COPY.detailsTitle, description: COPY.detailsDescription, blockedReason: props.detailsBlockedReason,
    content: <AdmissionForm {...form} layout="details" hideContact={Boolean(verification)} onSubmit={() => {}} />,
  });

  if (verification && availability) {
    const sent = Boolean(verification.challenge) || verification.proofReady;
    steps.push({
      id: "send", title: COPY.sendTitle, description: COPY.sendDescription,
      blockedReason: sent || props.issuing ? undefined : availability.noCountries ? COPY.noCountries : !verification.confirmed ? COPY.sendConfirmRequired : undefined,
      action: sent ? undefined : { label: COPY.sendAction, loading: props.issuing, disabled: availability.issueBlocked && !props.issuing, onRun: verification.onIssue },
      content: <ContactVerification {...verification} part="send" />,
    });
    steps.push({
      id: "verify", title: COPY.verifyTitle, description: COPY.verifyDescription,
      blockedReason: !verification.challenge && !verification.proofReady ? COPY.codeMissing : undefined,
      action: verification.proofReady ? undefined : { label: COPY.verifyAction, loading: props.verifying, disabled: availability.verifyBlocked && !props.verifying, onRun: verification.onVerify },
      content: <ContactVerification {...verification} part="verify" />,
      secondary: verification.challenge || props.recovery ? <>{verification.challenge && !verification.proofReady && <ContactVerificationResendActions {...verification} />}{props.recovery}</> : undefined,
      secondaryLabel: COPY.resendLabel,
    });
  }

  steps.push({
    id: "finish", title: submitting ? COPY.submitTitle : COPY.applyTitle, description: submitting ? COPY.submitDescription : COPY.applyDescription,
    blockedReason: props.finalAction.loading ? undefined : props.finalBlockedReason ?? (submitting && !form.confirmed ? COPY.submitConfirmRequired : undefined),
    content: submitting ? <>
      {verification?.proofReady && <p role="status" className={styles.AdmissionRequestSteps__success}>{COPY.proofChecked}</p>}
      <dl className={styles.AdmissionRequestSteps__facts}>
        {form.contactType === "phone" && <div className={styles.AdmissionRequestSteps__fact}><dt className={styles.AdmissionRequestSteps__term}>{COPY.phoneFact}</dt><dd className={styles.AdmissionRequestSteps__value}>{form.draft.phone || COPY.empty}{form.draft.country ? ` (${form.draft.country})` : ""}</dd></div>}
        {form.showWhatsappNumber && <div className={styles.AdmissionRequestSteps__fact}><dt className={styles.AdmissionRequestSteps__term}>{COPY.whatsappFact}</dt><dd className={styles.AdmissionRequestSteps__value}>{form.draft.whatsappNumber?.trim() || COPY.empty}</dd></div>}
        <div className={styles.AdmissionRequestSteps__fact}><dt className={styles.AdmissionRequestSteps__term}>{COPY.messageFact}</dt><dd className={styles.AdmissionRequestSteps__value}>{form.draft.message.trim() || COPY.empty}</dd></div>
        {verification && <div className={styles.AdmissionRequestSteps__fact}><dt className={styles.AdmissionRequestSteps__term}>{COPY.codeFact}</dt><dd className={styles.AdmissionRequestSteps__value}>{verification.proofReady ? COPY.codeChecked : COPY.codePending}</dd></div>}
      </dl>
      <AdmissionForm {...form} layout="consent" onSubmit={() => {}} />
    </> : <>
      {verification?.proofReady && <p role="status" className={styles.AdmissionRequestSteps__success}>{COPY.proofChecked}</p>}
      <p className={styles.AdmissionRequestSteps__note}>{verification?.proofReady ? COPY.applyReady : COPY.codePending}</p>
      {verification?.errorMessage && <p role="alert" className={styles.AdmissionRequestSteps__error}>{verification.errorMessage}</p>}
    </>,
  });

  return <div className={styles.AdmissionRequestSteps}>
    <GuidedSteps label={submitting ? COPY.submitLabel : COPY.applyLabel} steps={steps} current={props.step} onCurrentChange={props.onStepChange} busy={props.busy} finalAction={props.finalAction} />
  </div>;
}
