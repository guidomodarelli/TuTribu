/** Derives the leader's admission setup steps from current configuration facts. @module admission-setup-progress */

import { ADMISSION_SETUP_STEP, ADMISSION_SETUP_STEP_ORDER, ADMISSION_SETUP_STEP_STATUS, type AdmissionSetupStepId, type AdmissionSetupStepStatus } from "@/src/modules/academy-admissions/constants/admission-setup-guide";
import { MESSAGING_USAGE_LOW_NOTIFICATION_DAILY_LIMIT } from "@/src/modules/messaging/constants/messaging-usage";

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
    /** A saved candidate connection that is not the active one yet: a draft waiting to be published. */
    candidatePending?: boolean;
    usage: { countryCount: number; verificationDailyLimit: number; notificationDailyLimit: number } | null;
  } | null;
  notifications: { emailEnabled: boolean; receivesEmail: boolean } | null;
  /**
   * Informational activation check: a platform block means only the TuTribu team can let the leader open admissions;
   * closed academy admissions mean the leader has to switch them on in academy management first.
   */
  activation?: { platformBlocked: boolean; admissionsClosed?: boolean } | null;
};

export type AdmissionSetupStep = {
  id: AdmissionSetupStepId; status: AdmissionSetupStepStatus; paused?: boolean;
  /** Saved but not published yet (rules never activated, or a candidate connection that is not active). */
  draft?: boolean;
  /** Opening depends on the TuTribu team: the guide explains it instead of linking to a screen that would fail again. */
  platformBlocked?: boolean;
  /** Admissions are switched off in academy management: the guide links there instead of to the rules, which would fail again. */
  admissionsClosed?: boolean;
  /** Saved usage whose daily notice quota is below the low threshold while the tribe sends admission email. */
  lowNoticeQuota?: boolean;
  /** The tribe sends admission email, but the leader's own frequency omits it, so the leader receives none. */
  emailOmitted?: boolean;
};
export type AdmissionSetupProgress = {
  steps: AdmissionSetupStep[];
  /** Required steps that are done, out of the required total. */
  completed: number;
  required: number;
  /** First required step still pending, else the first optional one; `null` when nothing is left. */
  next: AdmissionSetupStepId | null;
};

/**
 * @param facts - Current configuration of rules, messaging, notifications and activation check.
 * @returns Ordered steps with their status, the required progress and the next step to take.
 */
export function deriveAdmissionSetupProgress(facts: AdmissionSetupFacts): AdmissionSetupProgress {
  const { policy, messaging, notifications } = facts;
  const emailNotices = notifications?.receivesEmail ?? false;
  const needsMessaging = policy.sendsCodes || emailNotices;
  const usage = messaging?.usage ?? null;
  const usageReady = isUsageReady(usage, policy, emailNotices);
  /** A saved notice quota under the threshold matters whenever the tribe sends admission email, to the leader or to other reviewers. */
  const lowNoticeQuota = usage !== null && (emailNotices || (notifications?.emailEnabled ?? false)) && usage.notificationDailyLimit < MESSAGING_USAGE_LOW_NOTIFICATION_DAILY_LIMIT;
  const activated = policy.open || policy.paused;
  const draftRules = policy.exists && !activated;
  const connected = messaging?.connected ?? false;
  const byId: Record<AdmissionSetupStepId, AdmissionSetupStep | null> = {
    rules: { id: ADMISSION_SETUP_STEP.rules, status: stepStatus(policy.exists, true), ...(draftRules ? { draft: true } : {}) },
    connection: { id: ADMISSION_SETUP_STEP.connection, status: stepStatus(connected, needsMessaging), ...(!connected && messaging?.candidatePending ? { draft: true } : {}) },
    usage: { id: ADMISSION_SETUP_STEP.usage, status: stepStatus(usageReady, needsMessaging), ...(lowNoticeQuota ? { lowNoticeQuota: true } : {}) },
    open: { id: ADMISSION_SETUP_STEP.open, status: stepStatus(policy.open, true), ...(policy.paused ? { paused: true } : {}), ...(draftRules ? { draft: true } : {}), ...activationFlags(activated, facts.activation ?? null) },
    notifications: { id: ADMISSION_SETUP_STEP.notifications, status: stepStatus(notifications !== null && notifications.emailEnabled && notifications.receivesEmail, false), ...(notifications?.emailEnabled && !notifications.receivesEmail ? { emailOmitted: true } : {}) },
  };
  const steps = ADMISSION_SETUP_STEP_ORDER.map((id) => byId[id]).filter((step): step is AdmissionSetupStep => step !== null);
  const requiredSteps = steps.filter((step) => isRequired(step.id, needsMessaging));
  const next = steps.find((step) => step.status === ADMISSION_SETUP_STEP_STATUS.pending) ?? steps.find((step) => step.status === ADMISSION_SETUP_STEP_STATUS.optional) ?? null;
  return { steps, completed: requiredSteps.filter((step) => step.status === ADMISSION_SETUP_STEP_STATUS.done).length, required: requiredSteps.length, next: next?.id ?? null };
}

/** @returns Whether the saved usage covers every quota the rules and notices need. */
function isUsageReady(usage: NonNullable<AdmissionSetupFacts["messaging"]>["usage"], policy: AdmissionSetupFacts["policy"], emailNotices: boolean): boolean {
  return usage !== null
    && (!emailNotices || usage.notificationDailyLimit > 0)
    && (!policy.verifiesPhone || (usage.countryCount > 0 && usage.verificationDailyLimit > 0))
    && (!policy.sendsCodes || usage.verificationDailyLimit > 0);
}

/** @returns Done when finished, else pending for required steps and optional for the rest. */
function stepStatus(done: boolean, required: boolean): AdmissionSetupStepStatus {
  if (done) return ADMISSION_SETUP_STEP_STATUS.done;
  return required ? ADMISSION_SETUP_STEP_STATUS.pending : ADMISSION_SETUP_STEP_STATUS.optional;
}

/** @returns The blocking activation flag for the opening step; a platform block wins over closed admissions. */
function activationFlags(activated: boolean, activation: NonNullable<AdmissionSetupFacts["activation"]> | null): Pick<AdmissionSetupStep, "platformBlocked" | "admissionsClosed"> {
  if (activated || !activation) return {};
  if (activation.platformBlocked) return { platformBlocked: true };
  return activation.admissionsClosed ? { admissionsClosed: true } : {};
}

/** Rules and opening are always required; messaging steps only when the rules or notices send messages. */
function isRequired(id: AdmissionSetupStepId, needsMessaging: boolean): boolean {
  if (id === ADMISSION_SETUP_STEP.rules || id === ADMISSION_SETUP_STEP.open) return true;
  if (id === ADMISSION_SETUP_STEP.notifications) return false;
  return needsMessaging;
}
