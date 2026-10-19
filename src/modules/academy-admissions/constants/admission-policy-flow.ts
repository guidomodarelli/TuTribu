/** Names the guided admission rules flow: its steps, the chained write stages and where each activation requirement is resolved. @module admission-policy-flow-constants */
import type { AdmissionPolicyActivationReason } from "../domain/policies/admission-policy-activation";

/** One decision per step; the leader edits them in this order. */
export type AdmissionPolicyStepId = "admission" | "contact" | "intake" | "review";
export const ADMISSION_POLICY_STEP = { admission: "admission", contact: "contact", intake: "intake", review: "review" } as const satisfies Record<string, AdmissionPolicyStepId>;

/** A write in flight: the final chained action passes through saving, checking and activating; status actions pause, resume or retry the original. */
export type AdmissionPolicyFlowStage = "saving" | "checking" | "activating" | "pausing" | "resuming" | "retrying";
export const ADMISSION_POLICY_FLOW_STAGE = { saving: "saving", checking: "checking", activating: "activating", pausing: "pausing", resuming: "resuming", retrying: "retrying" } as const satisfies Record<string, AdmissionPolicyFlowStage>;

/** The button that started the write in flight; only that button shows its loading state. */
export type AdmissionPolicyAction = "final" | "retry" | "pause" | "resume" | "original";
export const ADMISSION_POLICY_ACTION = { final: "final", retry: "retry", pause: "pause", resume: "resume", original: "original" } as const satisfies Record<string, AdmissionPolicyAction>;

/** Announces the sub-step that is running, next to the button that started it. */
export const ADMISSION_POLICY_FLOW_STAGE_COPY = {
  saving: "Guardando las reglas…",
  checking: "Revisando los requisitos…",
  activating: "Activando las admisiones…",
  pausing: "Pausando las admisiones…",
  resuming: "Reanudando las admisiones…",
  retrying: "Reintentando la operación original…",
} as const satisfies Record<AdmissionPolicyFlowStage, string>;

/** Says which sub-step failed, before the safe error message. */
export const ADMISSION_POLICY_FLOW_FAILURE_COPY = {
  saving: "No pudimos guardar las reglas.",
  checking: "No pudimos revisar los requisitos.",
  activating: "No pudimos activar las admisiones.",
  pausing: "No pudimos pausar las admisiones.",
  resuming: "No pudimos reanudar las admisiones.",
  retrying: "No pudimos reintentar la operación original.",
} as const satisfies Record<AdmissionPolicyFlowStage, string>;

/** Where the leader resolves a requirement: another admission page or the contact step of this flow. */
export type AdmissionPolicyRequirementDestination = "usage" | "connection" | "contact_step";
export const ADMISSION_POLICY_REQUIREMENT_DESTINATION = { usage: "usage", connection: "connection", contactStep: "contact_step" } as const satisfies Record<string, AdmissionPolicyRequirementDestination>;

/** Requirements without a destination are resolved by the platform team, so the flow only explains them. */
export const ADMISSION_POLICY_REQUIREMENT_DESTINATION_BY_REASON: Partial<Record<AdmissionPolicyActivationReason, AdmissionPolicyRequirementDestination>> = {
  verification_unavailable: ADMISSION_POLICY_REQUIREMENT_DESTINATION.connection,
  sms_alternative_unavailable: ADMISSION_POLICY_REQUIREMENT_DESTINATION.connection,
  verification_quota_unavailable: ADMISSION_POLICY_REQUIREMENT_DESTINATION.usage,
  recipient_countries_not_configured: ADMISSION_POLICY_REQUIREMENT_DESTINATION.usage,
  recipient_countries_restricted: ADMISSION_POLICY_REQUIREMENT_DESTINATION.usage,
  phone_channel_required: ADMISSION_POLICY_REQUIREMENT_DESTINATION.contactStep,
  phone_allowlist_verification_required: ADMISSION_POLICY_REQUIREMENT_DESTINATION.contactStep,
  sms_alternative_invalid: ADMISSION_POLICY_REQUIREMENT_DESTINATION.contactStep,
  contact_type_locked: ADMISSION_POLICY_REQUIREMENT_DESTINATION.contactStep,
};

/** The chained flow creates the missing policy itself, so this requirement is never shown as pending work. */
export const ADMISSION_POLICY_SELF_RESOLVED_REQUIREMENTS: readonly AdmissionPolicyActivationReason[] = ["policy_unavailable"];
