/** The auth owner allows only explicit local destinations for exact sensitive actions. @module reauthentication-navigation */
import { REAUTHENTICATION_OPERATION } from "./reauthentication-resources";
import {MESSAGING_CONNECTIONS_SETTINGS_SEGMENT} from "@/src/modules/messaging/constants/messaging-connections-browser";
export const REAUTHENTICATION_POLICY_OPERATIONS: readonly string[] = [REAUTHENTICATION_OPERATION.updateAdmissionPolicy, REAUTHENTICATION_OPERATION.activateAdmissionPolicy, REAUTHENTICATION_OPERATION.pauseAdmissionPolicy];
export const REAUTHENTICATION_POLICY_SETTINGS_SEGMENT = "academia/admissions/settings";
/** Early usage management can return only from its two exact resource-bound purposes. */
export const REAUTHENTICATION_USAGE_OPERATIONS: readonly string[] = [REAUTHENTICATION_OPERATION.initializeMessagingUsage, REAUTHENTICATION_OPERATION.updateMessagingUsage];
export const REAUTHENTICATION_USAGE_SETTINGS_SEGMENT = "academia/admissions/messaging";
/** Only implemented exact connection operations can return to the current tribe's wizard. */
export const REAUTHENTICATION_CONNECTION_OPERATIONS:readonly string[]=[REAUTHENTICATION_OPERATION.saveMessagingCredentials,REAUTHENTICATION_OPERATION.validateMessagingConnection,REAUTHENTICATION_OPERATION.readMessagingSenders,REAUTHENTICATION_OPERATION.readMessagingTemplates,REAUTHENTICATION_OPERATION.configureMessagingConnection,REAUTHENTICATION_OPERATION.diagnoseMessagingConnection,REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic,REAUTHENTICATION_OPERATION.activateMessagingConnection,REAUTHENTICATION_OPERATION.suspendMessagingConnection,REAUTHENTICATION_OPERATION.disconnectMessagingConnection];
export const REAUTHENTICATION_CONNECTION_SETTINGS_SEGMENT=MESSAGING_CONNECTIONS_SETTINGS_SEGMENT;
