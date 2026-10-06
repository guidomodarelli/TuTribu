/** Fixes server-owned resource/action and global recency scopes without browser permission flags. */
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

export const ADMISSION_RESOURCE_KIND = { request: "admission_request", allowlistEntry: "allowlist_entry", allowlistImport: "allowlist_import", personalInvitation: "personal_invitation", connection: "connection" } as const;
export const ADMISSION_OWN_REQUEST_ACTIONS = new Set<string>([ADMISSION_ACTION.readOwnRequest, ADMISSION_ACTION.cancelOwnRequest, ADMISSION_ACTION.attachOwnProof]);
export const ADMISSION_DECISION_ACTIONS = new Set<string>([ADMISSION_ACTION.decideRequest, ADMISSION_ACTION.rejectRequest]);
/** These actions have no ordinary read variant; list/invitation reads remain leader-only without recency. */
export const ADMISSION_REQUIRED_RECENCY_ACTIONS = new Set<string>([ADMISSION_ACTION.configurePolicy, ADMISSION_ACTION.allowEarlyRetry, ADMISSION_ACTION.manageConnection]);

/** Sensitive writers select one of these exact signed operations; an unrelated recency cannot authorize them. */
export const ADMISSION_SENSITIVE_OPERATIONS: Readonly<Partial<Record<string, readonly string[]>>> = {
  [ADMISSION_ACTION.configurePolicy]: [REAUTHENTICATION_OPERATION.updateAdmissionPolicy, REAUTHENTICATION_OPERATION.activateAdmissionPolicy, REAUTHENTICATION_OPERATION.pauseAdmissionPolicy],
  [ADMISSION_ACTION.manageAllowlist]: [REAUTHENTICATION_OPERATION.createAllowlistEntry, REAUTHENTICATION_OPERATION.updateAllowlistEntry, REAUTHENTICATION_OPERATION.previewAllowlistImport, REAUTHENTICATION_OPERATION.confirmAllowlistImport],
  [ADMISSION_ACTION.manageInvitations]: [REAUTHENTICATION_OPERATION.createPersonalInvitation, REAUTHENTICATION_OPERATION.renamePersonalInvitation, REAUTHENTICATION_OPERATION.revokePersonalInvitation],
  [ADMISSION_ACTION.allowEarlyRetry]: [REAUTHENTICATION_OPERATION.advanceAdmissionRetry],
  [ADMISSION_ACTION.manageConnection]: [REAUTHENTICATION_OPERATION.saveMessagingCredentials, REAUTHENTICATION_OPERATION.configureMessagingConnection, REAUTHENTICATION_OPERATION.activateMessagingConnection, REAUTHENTICATION_OPERATION.suspendMessagingConnection, REAUTHENTICATION_OPERATION.disconnectMessagingConnection],
};
