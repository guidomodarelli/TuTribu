/** Composes the leader's setup guide from the current rules, messaging and notification page states. @module admission-setup-guide-page */
import "server-only";
import { loadAdmissionPolicyPageState } from "./admission-policy-page";
import { loadAdmissionNotificationSettingsPageState } from "@/src/modules/notifications/infrastructure/composition/admission-notification-settings-page";
import { loadMessagingConnectionsPageState } from "@/src/modules/messaging/infrastructure/composition/messaging-connections-page";
import { deriveAdmissionSetupProgress, type AdmissionSetupFacts, type AdmissionSetupProgress } from "@/src/modules/academy-admissions/application/queries/admission-setup-progress";
import type { AdmissionPolicyPageState } from "@/src/modules/academy-admissions/application/results/admission-policy-page-state";
import type { AdmissionNotificationSettingsPageState } from "@/src/modules/notifications/application/results/admission-notification-settings-page-state";
import type { MessagingConnectionsPageState } from "@/src/modules/messaging/application/results/messaging-connections-page-state";
import { ADMISSION_POLICY_PUBLIC_STATE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_USAGE_POLICY_STATE } from "@/src/modules/messaging/constants/messaging-limits";
import { ADMISSION_NOTIFICATION_PREFERENCE_MODE } from "@/src/modules/notifications/constants/admission-notification-preference";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";

/** Server-selected openers of each area's own page use case, supplied by the route entrypoint. */
export type AdmissionSetupGuideOpeners = {
  policy: Parameters<typeof loadAdmissionPolicyPageState>[1];
  notifications: Parameters<typeof loadAdmissionNotificationSettingsPageState>[1];
  messaging: Parameters<typeof loadMessagingConnectionsPageState>[1];
};

/** Ready guide for the current leader, or `null` when the viewer is not the leader or the rules cannot be read. */
export type AdmissionSetupGuideState = { slug: string; progress: AdmissionSetupProgress } | null;

/**
 * Reads the three settings areas in parallel through their own guarded loaders, so the guide never widens what each page already authorizes.
 *
 * @param input - Unvalidated route params and query, validated by each loader.
 * @param open - Openers of the rules, notifications and messaging page use cases.
 * @returns The derived guide, or `null` for any viewer that is not the current leader.
 */
export async function loadAdmissionSetupGuideState(input: unknown, open: AdmissionSetupGuideOpeners): Promise<AdmissionSetupGuideState> {
  const [policyState, notificationState, messagingState] = await Promise.all([
    loadAdmissionPolicyPageState(input, open.policy),
    loadAdmissionNotificationSettingsPageState(input, open.notifications),
    loadMessagingConnectionsPageState(input, open.messaging),
  ]);
  if (policyState.kind !== "ready") return null;
  const messaging = readMessagingFacts(messagingState);
  if (!messaging.leader) return null;
  return { slug: policyState.slug, progress: deriveAdmissionSetupProgress({ policy: readPolicyFacts(policyState), messaging: messaging.facts, notifications: readNotificationFacts(notificationState) }) };
}

/** Maps the rules page state to the guide's policy facts. */
function readPolicyFacts(state: Extract<AdmissionPolicyPageState, { kind: "ready" }>): AdmissionSetupFacts["policy"] {
  const { policy } = state.policy;
  const sendsCodes = policy !== null && (policy.requiresAdditionalVerification || policy.contactType === ADMISSION_CONTACT_TYPE.phone);
  return {
    exists: policy !== null,
    open: state.policy.state === ADMISSION_POLICY_PUBLIC_STATE.active,
    paused: state.policy.state === ADMISSION_POLICY_PUBLIC_STATE.paused,
    sendsCodes,
    verifiesPhone: policy?.contactType === ADMISSION_CONTACT_TYPE.phone,
  };
}

/** Only the leader audience carries connection and usage facts; guardians do not get a guide. */
function readMessagingFacts(state: MessagingConnectionsPageState): { leader: boolean; facts: AdmissionSetupFacts["messaging"] } {
  if (state.kind !== "ready") return { leader: true, facts: null };
  const { configuration } = state;
  if (configuration.audience !== TRIBE_MEMBER_ROLE.leader) return { leader: false, facts: null };
  const usage = configuration.usage.state === MESSAGING_USAGE_POLICY_STATE.configured
    ? { countryCount: configuration.usage.policy.allowedCountries.length, verificationDailyLimit: configuration.usage.policy.verificationDailyLimit, notificationDailyLimit: configuration.usage.policy.notificationDailyLimit }
    : null;
  return { leader: true, facts: { connected: configuration.selected?.state === MESSAGING_CONNECTION_STATE.active, usage } };
}

/** Email notices need both the tribe's email switch and a personal frequency other than "omitted". */
function readNotificationFacts(state: AdmissionNotificationSettingsPageState): AdmissionSetupFacts["notifications"] {
  if (state.kind !== "ready") return null;
  return { emailEnabled: state.email?.enabled ?? false, receivesEmail: state.preference.mode !== ADMISSION_NOTIFICATION_PREFERENCE_MODE.omitted };
}
