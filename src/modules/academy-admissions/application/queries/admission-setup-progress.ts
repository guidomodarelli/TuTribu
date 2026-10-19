/** Derives the leader's admission setup steps from current configuration facts. @module admission-setup-progress */

import { ADMISSION_SETUP_STEP, ADMISSION_SETUP_STEP_ORDER, ADMISSION_SETUP_STEP_STATUS, type AdmissionSetupStepId, type AdmissionSetupStepStatus } from "@/src/modules/academy-admissions/constants/admission-setup-guide";

/** Current facts of each settings area; `null` when that area could not be read for this viewer. */
export type AdmissionSetupFacts = {
  policy: {
    exists: boolean;
    /** The control is activated and the rules accept new requests. */
    open: boolean;
    /** The control was activated once and is now paused. */
    paused: boolean;
    /** The rules send verification codes, so messaging is required. */
    sendsCodes: boolean;
    /** The rules verify a phone number, so countries and a code quota are required. */
    verifiesPhone: boolean;
  };
  messaging: {
    connected: boolean;
    usage: { countryCount: number; verificationDailyLimit: number; notificationDailyLimit: number } | null;
  } | null;
  notifications: { emailEnabled: boolean; receivesEmail: boolean } | null;
};

export type AdmissionSetupStep = { id: AdmissionSetupStepId; status: AdmissionSetupStepStatus; paused?: boolean };
export type AdmissionSetupProgress = {
  steps: AdmissionSetupStep[];
  /** Required steps that are done, out of the required total. */
  completed: number;
  required: number;
  /** First required step still pending, else the first optional one; `null` when nothing is left. */
  next: AdmissionSetupStepId | null;
};

/**
 * @param facts - Current configuration of rules, messaging and notifications.
 * @returns Ordered steps with their status, the required progress and the next step to take.
 */
export function deriveAdmissionSetupProgress(facts: AdmissionSetupFacts): AdmissionSetupProgress {
  const { policy, messaging, notifications } = facts;
  const emailNotices = notifications?.receivesEmail ?? false;
  const needsMessaging = policy.sendsCodes || emailNotices;
  const usage = messaging?.usage ?? null;
  const usageReady = usage !== null
    && (!emailNotices || usage.notificationDailyLimit > 0)
    && (!policy.verifiesPhone || (usage.countryCount > 0 && usage.verificationDailyLimit > 0))
    && (!policy.sendsCodes || usage.verificationDailyLimit > 0);
  const status = (done: boolean, required: boolean): AdmissionSetupStepStatus => (done ? ADMISSION_SETUP_STEP_STATUS.done : required ? ADMISSION_SETUP_STEP_STATUS.pending : ADMISSION_SETUP_STEP_STATUS.optional);
  const byId: Record<AdmissionSetupStepId, AdmissionSetupStep> = {
    rules: { id: ADMISSION_SETUP_STEP.rules, status: status(policy.exists, true) },
    connection: { id: ADMISSION_SETUP_STEP.connection, status: status(messaging?.connected ?? false, needsMessaging) },
    usage: { id: ADMISSION_SETUP_STEP.usage, status: status(usageReady, needsMessaging) },
    open: { id: ADMISSION_SETUP_STEP.open, status: status(policy.open, true), ...(policy.paused ? { paused: true } : {}) },
    notifications: { id: ADMISSION_SETUP_STEP.notifications, status: status(notifications !== null && notifications.emailEnabled && notifications.receivesEmail, false) },
  };
  const steps = ADMISSION_SETUP_STEP_ORDER.map((id) => byId[id]);
  const requiredSteps = steps.filter((step) => isRequired(step.id, needsMessaging));
  const next = steps.find((step) => step.status === ADMISSION_SETUP_STEP_STATUS.pending) ?? steps.find((step) => step.status === ADMISSION_SETUP_STEP_STATUS.optional) ?? null;
  return { steps, completed: requiredSteps.filter((step) => step.status === ADMISSION_SETUP_STEP_STATUS.done).length, required: requiredSteps.length, next: next?.id ?? null };
}

/** Rules and opening are always required; messaging steps only when the rules or notices send messages. */
function isRequired(id: AdmissionSetupStepId, needsMessaging: boolean): boolean {
  if (id === ADMISSION_SETUP_STEP.rules || id === ADMISSION_SETUP_STEP.open) return true;
  if (id === ADMISSION_SETUP_STEP.notifications) return false;
  return needsMessaging;
}
