/** Derives the leader's admission setup steps from current configuration facts. @module admission-setup-progress */

import { ADMISSION_SETUP_MESSAGING_NEED, ADMISSION_SETUP_STEP, ADMISSION_SETUP_STEP_ORDER, ADMISSION_SETUP_STEP_STATUS, type AdmissionSetupMessagingNeed, type AdmissionSetupStepId, type AdmissionSetupStepStatus } from "@/src/modules/academy-admissions/constants/admission-setup-guide";
import { MESSAGING_USAGE_LOW_NOTIFICATION_DAILY_LIMIT } from "@/src/modules/messaging/constants/messaging-usage";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/** Current facts of each settings area; `null` when that area could not be read for this viewer. */
export type AdmissionSetupFacts = {
  policy: {
    exists: boolean;
    /** The control is activated and the rules accept new requests. */
    open: boolean;
    /** The control was activated once and is now paused. */
    paused: boolean;
    /** The rules send verification codes (additional contact verification), so messaging is required. */
    sendsCodes: boolean;
    /** The rules verify a phone number with a code, so countries and a code quota are required. */
    verifiesPhone: boolean;
  };
  messaging: {
    connected: boolean;
    /** A saved candidate connection that is not the active one yet: a draft waiting to be published. */
    candidatePending?: boolean;
    usage: { countryCount: number; verificationDailyLimit: number; notificationDailyLimit: number } | null;
  } | null;
  /**
   * `emailEnabled` is the tribe email switch; `receivesEmail` only says the leader's frequency is not «omitted».
   * `preparedEmailAvailable` is the tested email capability the email write requires to enable the switch, as the notices page reads
   * it; absent or `null` while it decides nothing (the switch is on, the platform blocks every change) or could not be read.
   */
  notifications: { emailEnabled: boolean; receivesEmail: boolean; preparedEmailAvailable?: boolean | null } | null;
  /**
   * Informational activation check: a platform block means only the TuTribu team can let the leader open admissions;
   * closed academy admissions mean the leader has to switch them on in academy management first.
   */
  activation?: { platformBlocked: boolean; admissionsClosed?: boolean } | null;
  /**
   * Platform security the rules read names: while it is missing or locked no admission write can be protected (rules, messaging,
   * quotas, notices), so only the TuTribu team can let the leader continue.
   */
  platformSecurity?: PlatformSecurityRequirement | null;
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
  /** Why a pending connection step is needed: codes from the rules, email notices to the leader, or both. */
  messagingNeed?: AdmissionSetupMessagingNeed;
  /**
   * Another step whose configuration the server requires before this one can be completed: testing and activating a connection
   * need saved countries and quotas, and enabling the tribe email needs a prepared email in the connection. The guide's action
   * opens that step instead of a screen whose save would be rejected.
   */
  blockedBy?: AdmissionSetupStepId;
};
export type AdmissionSetupProgress = {
  steps: AdmissionSetupStep[];
  /** Required steps that are done, out of the required total. */
  completed: number;
  required: number;
  /**
   * First required step still pending, else the first optional one; `null` when nothing is left. Required steps come first, so this
   * is also the first unfinished step of the list.
   */
  next: AdmissionSetupStepId | null;
  /**
   * One notice replaces every step action while the platform cannot protect admission writes; `rulesSaved` tells whether a
   * draft or active rules exist, so the notice never mentions saved rules that do not exist.
   */
  platformSecurity: { requirement: PlatformSecurityRequirement; rulesSaved: boolean } | null;
};

/**
 * @param facts - Current configuration of rules, messaging, notifications and activation check.
 * @returns The steps grouped by requirement (required first, then optional; base order inside each group, whatever their status),
 * the required progress and the next step to take.
 */
export function deriveAdmissionSetupProgress(facts: AdmissionSetupFacts): AdmissionSetupProgress {
  const { policy, messaging, notifications } = facts;
  /** The tribe sends admission email to someone (the leader or other reviewers) only while its email switch is on. */
  const tribeSendsEmail = notifications?.emailEnabled ?? false;
  /** The leader receives email notices only with the tribe switch on and a personal frequency other than «omitted». */
  const emailNotices = tribeSendsEmail && (notifications?.receivesEmail ?? false);
  const messagingNeed = readMessagingNeed(policy.sendsCodes, emailNotices);
  const needsMessaging = messagingNeed !== null;
  const usage = messaging?.usage ?? null;
  const usageReady = isUsageReady(usage, policy, emailNotices);
  /** A saved notice quota under the threshold matters whenever the tribe sends admission email, to the leader or to other reviewers. */
  const lowNoticeQuota = usage !== null && tribeSendsEmail && usage.notificationDailyLimit < MESSAGING_USAGE_LOW_NOTIFICATION_DAILY_LIMIT;
  const activated = policy.open || policy.paused;
  const draftRules = policy.exists && !activated;
  const connected = messaging?.connected ?? false;
  const platformSecurity = facts.platformSecurity ?? null;
  /** The single platform notice already explains why nothing can be opened; the opening step repeats no other block. */
  const activation = platformSecurity ? null : facts.activation ?? null;
  const prerequisites = readStepPrerequisites(facts, tribeSendsEmail);
  const byId: Record<AdmissionSetupStepId, AdmissionSetupStep | null> = {
    rules: { id: ADMISSION_SETUP_STEP.rules, status: stepStatus(policy.exists, true), ...(draftRules ? { draft: true } : {}) },
    connection: { id: ADMISSION_SETUP_STEP.connection, status: stepStatus(connected, needsMessaging), ...(!connected && messaging?.candidatePending ? { draft: true } : {}), ...(!connected && messagingNeed ? { messagingNeed } : {}), ...blockedByFlag(prerequisites.connection) },
    usage: { id: ADMISSION_SETUP_STEP.usage, status: stepStatus(usageReady, needsMessaging), ...(lowNoticeQuota ? { lowNoticeQuota: true } : {}) },
    open: { id: ADMISSION_SETUP_STEP.open, status: stepStatus(policy.open, true), ...(policy.paused ? { paused: true } : {}), ...(draftRules ? { draft: true } : {}), ...activationFlags(activated, activation) },
    notifications: { id: ADMISSION_SETUP_STEP.notifications, status: stepStatus(emailNotices, false), ...(tribeSendsEmail && !emailNotices ? { emailOmitted: true } : {}), ...blockedByFlag(prerequisites.notifications) },
  };
  const baseOrder = ADMISSION_SETUP_STEP_ORDER.map((id) => byId[id]).filter((step): step is AdmissionSetupStep => step !== null);
  const { steps, requiredSteps } = groupByRequirement(baseOrder, needsMessaging);
  const next = steps.find((step) => step.status === ADMISSION_SETUP_STEP_STATUS.pending) ?? steps.find((step) => step.status === ADMISSION_SETUP_STEP_STATUS.optional) ?? null;
  return { steps, completed: requiredSteps.filter((step) => step.status === ADMISSION_SETUP_STEP_STATUS.done).length, required: requiredSteps.length, next: next?.id ?? null,
    platformSecurity: platformSecurity ? { requirement: platformSecurity, rulesSaved: policy.exists } : null };
}

/**
 * @param sendsCodes - Whether the rules send verification codes. @param emailNotices - Whether the leader receives email notices.
 * @returns What makes messaging necessary, or `null` when nothing is sent and the messaging steps stay optional.
 */
function readMessagingNeed(sendsCodes: boolean, emailNotices: boolean): AdmissionSetupMessagingNeed | null {
  if (sendsCodes && emailNotices) return ADMISSION_SETUP_MESSAGING_NEED.codesAndNotices;
  if (sendsCodes) return ADMISSION_SETUP_MESSAGING_NEED.codes;
  return emailNotices ? ADMISSION_SETUP_MESSAGING_NEED.notices : null;
}

/** @returns Whether the saved usage covers every quota the rules and notices need. */
function isUsageReady(usage: NonNullable<AdmissionSetupFacts["messaging"]>["usage"], policy: AdmissionSetupFacts["policy"], emailNotices: boolean): boolean {
  return usage !== null
    && (!emailNotices || usage.notificationDailyLimit > 0)
    && (!policy.verifiesPhone || (usage.countryCount > 0 && usage.verificationDailyLimit > 0))
    && (!policy.sendsCodes || usage.verificationDailyLimit > 0);
}

/**
 * Reads the step each step waits for, from read facts only: an unread area never blocks a step, and while the platform cannot protect
 * admission writes its single notice already explains every block.
 *
 * @param facts - Current configuration facts. @param tribeSendsEmail - Whether the tribe email switch is on.
 * @returns The prerequisite step of each blocked step.
 */
function readStepPrerequisites(facts: AdmissionSetupFacts, tribeSendsEmail: boolean): Partial<Record<AdmissionSetupStepId, AdmissionSetupStepId>> {
  if (facts.platformSecurity) return {};
  const { messaging, notifications } = facts;
  return {
    // Testing and activating a connection need saved countries and quotas: the code issuer rejects a test without them (`usage_policy_missing`).
    ...(messaging && !messaging.connected && messaging.usage === null ? { connection: ADMISSION_SETUP_STEP.usage } : {}),
    // Enabling the tribe email needs a prepared email in the connection: the email write rejects it otherwise (`email_capability_unavailable`).
    ...(!tribeSendsEmail && notifications?.preparedEmailAvailable === false ? { notifications: ADMISSION_SETUP_STEP.connection } : {}),
  };
}

/** @param prerequisite - The step a step waits for, if any. @returns Its `blockedBy` flag, or nothing. */
function blockedByFlag(prerequisite: AdmissionSetupStepId | undefined): Pick<AdmissionSetupStep, "blockedBy"> {
  return prerequisite ? { blockedBy: prerequisite } : {};
}

/**
 * Groups by requirement, not by status: an optional step that is already done stays with the optional ones.
 *
 * @param baseOrder - Steps in their base completion order. @param needsMessaging - Whether the messaging steps are required.
 * @returns Required steps first and optional ones last, keeping the base order inside each group, and the required ones alone.
 */
function groupByRequirement(baseOrder: AdmissionSetupStep[], needsMessaging: boolean): { steps: AdmissionSetupStep[]; requiredSteps: AdmissionSetupStep[] } {
  const requiredSteps = baseOrder.filter((step) => isRequired(step.id, needsMessaging));
  return { steps: [...requiredSteps, ...baseOrder.filter((step) => !isRequired(step.id, needsMessaging))], requiredSteps };
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

/** Rules and opening are always required; messaging steps only when the rules send codes or the leader receives email notices. */
function isRequired(id: AdmissionSetupStepId, needsMessaging: boolean): boolean {
  if (id === ADMISSION_SETUP_STEP.rules || id === ADMISSION_SETUP_STEP.open) return true;
  if (id === ADMISSION_SETUP_STEP.notifications) return false;
  return needsMessaging;
}
