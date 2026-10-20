/** Names the guided admission rules flow: its steps, the chained write stages and where each activation requirement is resolved. @module admission-policy-flow-constants */
import type { AdmissionPolicyActivationReason } from "../domain/policies/admission-policy-activation";
import type { AdmissionPreflightReason } from "../domain/policies/admission-activation-preflight";

/** One decision per step; the leader edits them in this order. */
export type AdmissionPolicyStepId = "admission" | "contact" | "intake" | "memberships" | "review";
export const ADMISSION_POLICY_STEP = { admission: "admission", contact: "contact", intake: "intake", memberships: "memberships", review: "review" } as const satisfies Record<string, AdmissionPolicyStepId>;

/** A write in flight: the final chained action passes through saving, checking and activating; status actions pause, resume or retry the original. */
export type AdmissionPolicyFlowStage = "saving" | "checking" | "activating" | "pausing" | "resuming" | "retrying";
export const ADMISSION_POLICY_FLOW_STAGE = { saving: "saving", checking: "checking", activating: "activating", pausing: "pausing", resuming: "resuming", retrying: "retrying" } as const satisfies Record<string, AdmissionPolicyFlowStage>;

/** The button that started the write in flight; only that button shows its loading state. */
export type AdmissionPolicyAction = "final" | "retry" | "pause" | "resume" | "original" | "recheck";
export const ADMISSION_POLICY_ACTION = { final: "final", retry: "retry", pause: "pause", resume: "resume", original: "original", recheck: "recheck" } as const satisfies Record<string, AdmissionPolicyAction>;

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

/** Every reason that can stop an activation or a resume: the informational preflight and the activation requirements. */
export type AdmissionPolicyBlockReason = AdmissionPreflightReason | AdmissionPolicyActivationReason;

/**
 * How a blocking reason is resolved: on another admission page, in a step of this flow, by checking again,
 * by the TuTribu team, or by the flow itself (the chained action creates the missing policy).
 */
export type AdmissionPolicyBlockResolution = "usage" | "connection" | "contact_step" | "academy" | "commercial_review" | "recheck" | "platform" | "self_resolved";
export const ADMISSION_POLICY_BLOCK_RESOLUTION = {
  usage: "usage", connection: "connection", contactStep: "contact_step", academy: "academy",
  commercialReview: "commercial_review", recheck: "recheck", platform: "platform", selfResolved: "self_resolved",
} as const satisfies Record<string, AdmissionPolicyBlockResolution>;

/** Exhaustive map: a new reason cannot ship without saying who resolves it and where. */
export const ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON = {
  verification_unavailable: ADMISSION_POLICY_BLOCK_RESOLUTION.connection,
  sms_alternative_unavailable: ADMISSION_POLICY_BLOCK_RESOLUTION.connection,
  verification_quota_unavailable: ADMISSION_POLICY_BLOCK_RESOLUTION.usage,
  recipient_countries_not_configured: ADMISSION_POLICY_BLOCK_RESOLUTION.usage,
  recipient_countries_restricted: ADMISSION_POLICY_BLOCK_RESOLUTION.usage,
  phone_channel_required: ADMISSION_POLICY_BLOCK_RESOLUTION.contactStep,
  phone_allowlist_verification_required: ADMISSION_POLICY_BLOCK_RESOLUTION.contactStep,
  sms_alternative_invalid: ADMISSION_POLICY_BLOCK_RESOLUTION.contactStep,
  contact_type_locked: ADMISSION_POLICY_BLOCK_RESOLUTION.contactStep,
  academy_unavailable: ADMISSION_POLICY_BLOCK_RESOLUTION.academy,
  preflight_academy_unavailable: ADMISSION_POLICY_BLOCK_RESOLUTION.academy,
  preflight_unknown_commercial_history: ADMISSION_POLICY_BLOCK_RESOLUTION.commercialReview,
  preflight_privileged_commercial_membership: ADMISSION_POLICY_BLOCK_RESOLUTION.commercialReview,
  policy_scope_mismatch: ADMISSION_POLICY_BLOCK_RESOLUTION.recheck,
  preflight_scope_mismatch: ADMISSION_POLICY_BLOCK_RESOLUTION.recheck,
  admission_clock_invalid: ADMISSION_POLICY_BLOCK_RESOLUTION.recheck,
  policy_unavailable: ADMISSION_POLICY_BLOCK_RESOLUTION.selfResolved,
  preflight_policy_unavailable: ADMISSION_POLICY_BLOCK_RESOLUTION.selfResolved,
  preflight_storage_unavailable: ADMISSION_POLICY_BLOCK_RESOLUTION.platform,
  preflight_ingress_unprotected: ADMISSION_POLICY_BLOCK_RESOLUTION.platform,
  preflight_marker_inconsistent: ADMISSION_POLICY_BLOCK_RESOLUTION.platform,
  preflight_runtime_unavailable: ADMISSION_POLICY_BLOCK_RESOLUTION.platform,
  preflight_evaluator_disabled: ADMISSION_POLICY_BLOCK_RESOLUTION.platform,
  preflight_recovery_locked: ADMISSION_POLICY_BLOCK_RESOLUTION.platform,
  admission_preflight_incomplete: ADMISSION_POLICY_BLOCK_RESOLUTION.platform,
  admission_evaluator_unavailable: ADMISSION_POLICY_BLOCK_RESOLUTION.platform,
  admission_recovery_locked: ADMISSION_POLICY_BLOCK_RESOLUTION.platform,
} as const satisfies Record<AdmissionPolicyBlockReason, AdmissionPolicyBlockResolution>;

/** Reasons only the TuTribu team can resolve; the flow never offers to publish while one is present. */
export const ADMISSION_POLICY_PLATFORM_REASONS = (Object.keys(ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON) as AdmissionPolicyBlockReason[])
  .filter((reason) => ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[reason] === ADMISSION_POLICY_BLOCK_RESOLUTION.platform);

/** @param reason - Blocking reason. @returns Whether the TuTribu team, not the leader, has to resolve it. */
export function isAdmissionPolicyPlatformReason(reason: AdmissionPolicyBlockReason): boolean {
  return ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[reason] === ADMISSION_POLICY_BLOCK_RESOLUTION.platform;
}

/** The chained flow creates the missing policy itself, so this requirement is never shown as pending work. */
export const ADMISSION_POLICY_SELF_RESOLVED_REQUIREMENTS: readonly AdmissionPolicyActivationReason[] = ["policy_unavailable"];

/** Allowlisted return target carried to another settings page; never a free URL. */
export type AdmissionSettingsReturnTarget = "policy-review";
export const ADMISSION_SETTINGS_RETURN_TARGET = { policyReview: "policy-review" } as const satisfies Record<string, AdmissionSettingsReturnTarget>;
/** Query parameter names of the settings navigation; values are validated against their allowlists. */
export const ADMISSION_SETTINGS_NAVIGATION_PARAM = { returnTo: "return", step: "step" } as const;
/** Steps of the rules flow that a link may open directly. */
export type AdmissionPolicyEntryStep = "review" | "memberships";
export const ADMISSION_POLICY_ENTRY_STEP = { review: "review", memberships: "memberships" } as const satisfies Record<string, AdmissionPolicyEntryStep>;
