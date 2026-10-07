/** The auth owner allows only explicit local destinations for exact sensitive actions. @module reauthentication-navigation */
import { REAUTHENTICATION_OPERATION } from "./reauthentication-resources";
export const REAUTHENTICATION_POLICY_OPERATIONS: readonly string[] = [REAUTHENTICATION_OPERATION.updateAdmissionPolicy, REAUTHENTICATION_OPERATION.activateAdmissionPolicy, REAUTHENTICATION_OPERATION.pauseAdmissionPolicy];
export const REAUTHENTICATION_POLICY_SETTINGS_SEGMENT = "academia/admissions/settings";
/** Early usage management can return only from its two exact resource-bound purposes. */
export const REAUTHENTICATION_USAGE_OPERATIONS: readonly string[] = [REAUTHENTICATION_OPERATION.initializeMessagingUsage, REAUTHENTICATION_OPERATION.updateMessagingUsage];
export const REAUTHENTICATION_USAGE_SETTINGS_SEGMENT = "academia/admissions/messaging";
