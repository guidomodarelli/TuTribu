/** Enumerates exact sensitive actions; authenticated recency never authorizes another action. */
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "./message-delivery-reauthentication";
export const REAUTHENTICATION_OPERATION={
  saveMessagingCredentials:"save_messaging_credentials",validateMessagingConnection:"validate_messaging_connection",readMessagingSenders:"read_messaging_senders",readMessagingTemplates:"read_messaging_templates",configureMessagingConnection:"configure_messaging_connection",diagnoseMessagingConnection:"diagnose_messaging_connection",verifyMessagingDiagnostic:"verify_messaging_diagnostic",activateMessagingConnection:"activate_messaging_connection",suspendMessagingConnection:"suspend_messaging_connection",disconnectMessagingConnection:"disconnect_messaging_connection",initializeMessagingUsage:"initialize_messaging_usage",updateMessagingUsage:"update_messaging_usage",
  updateAdmissionPolicy:"update_admission_policy",activateAdmissionPolicy:"activate_admission_policy",pauseAdmissionPolicy:"pause_admission_policy",createAllowlistEntry:"create_allowlist_entry",updateAllowlistEntry:"update_allowlist_entry",previewAllowlistImport:"preview_allowlist_import",confirmAllowlistImport:"confirm_allowlist_import",createPersonalInvitation:"create_personal_invitation",renamePersonalInvitation:"rename_personal_invitation",revokePersonalInvitation:"revoke_personal_invitation",advanceAdmissionRetry:"advance_admission_retry",
  reconcileMessageDelivery:MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.reconcile,
  recoverNotificationDelivery:MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification,
  exitAcademyMode: "exit_academy_mode",
  deleteTribe: "delete_tribe",
} as const satisfies Record<string, ReauthenticationOperation>;
/** Enumerates the exact global-recency contract independently of runtime constants. */
export type ReauthenticationOperation=
  | "save_messaging_credentials" | "validate_messaging_connection" | "read_messaging_senders" | "read_messaging_templates"
  | "configure_messaging_connection" | "diagnose_messaging_connection" | "verify_messaging_diagnostic" | "activate_messaging_connection"
  | "suspend_messaging_connection" | "disconnect_messaging_connection" | "initialize_messaging_usage" | "update_messaging_usage"
  | "update_admission_policy" | "activate_admission_policy" | "pause_admission_policy" | "create_allowlist_entry"
  | "update_allowlist_entry" | "preview_allowlist_import" | "confirm_allowlist_import" | "create_personal_invitation"
  | "rename_personal_invitation" | "revoke_personal_invitation" | "advance_admission_retry"
  | "reconcile_message_delivery" | "recover_notification_delivery" | "exit_academy_mode" | "delete_tribe";
/** Static owners select SQL resources; client input can never select a table or permissive query. */
export const REAUTHENTICATION_RESOURCE_KIND={tribe:"tribe",connection:"connection",delivery:"delivery",allowlistEntry:"allowlist_entry",allowlistImport:"allowlist_import",personalInvitation:"personal_invitation",admissionRequest:"admission_request"} as const;
export const REAUTHENTICATION_OPERATION_RESOURCE={
  [REAUTHENTICATION_OPERATION.saveMessagingCredentials]:REAUTHENTICATION_RESOURCE_KIND.tribe,
  [REAUTHENTICATION_OPERATION.validateMessagingConnection]:REAUTHENTICATION_RESOURCE_KIND.connection,
  [REAUTHENTICATION_OPERATION.readMessagingSenders]:REAUTHENTICATION_RESOURCE_KIND.connection,
  [REAUTHENTICATION_OPERATION.readMessagingTemplates]:REAUTHENTICATION_RESOURCE_KIND.connection,
  [REAUTHENTICATION_OPERATION.configureMessagingConnection]:REAUTHENTICATION_RESOURCE_KIND.connection,
  [REAUTHENTICATION_OPERATION.diagnoseMessagingConnection]:REAUTHENTICATION_RESOURCE_KIND.connection,
  [REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic]:REAUTHENTICATION_RESOURCE_KIND.connection,
  [REAUTHENTICATION_OPERATION.activateMessagingConnection]:REAUTHENTICATION_RESOURCE_KIND.connection,
  [REAUTHENTICATION_OPERATION.suspendMessagingConnection]:REAUTHENTICATION_RESOURCE_KIND.connection,
  [REAUTHENTICATION_OPERATION.disconnectMessagingConnection]:REAUTHENTICATION_RESOURCE_KIND.connection,
  [REAUTHENTICATION_OPERATION.reconcileMessageDelivery]:REAUTHENTICATION_RESOURCE_KIND.connection,
  [REAUTHENTICATION_OPERATION.recoverNotificationDelivery]:REAUTHENTICATION_RESOURCE_KIND.delivery,
  [REAUTHENTICATION_OPERATION.initializeMessagingUsage]:REAUTHENTICATION_RESOURCE_KIND.tribe,
  [REAUTHENTICATION_OPERATION.updateMessagingUsage]:REAUTHENTICATION_RESOURCE_KIND.tribe,
  [REAUTHENTICATION_OPERATION.updateAdmissionPolicy]:REAUTHENTICATION_RESOURCE_KIND.tribe,
  [REAUTHENTICATION_OPERATION.activateAdmissionPolicy]:REAUTHENTICATION_RESOURCE_KIND.tribe,
  [REAUTHENTICATION_OPERATION.pauseAdmissionPolicy]:REAUTHENTICATION_RESOURCE_KIND.tribe,
  [REAUTHENTICATION_OPERATION.createAllowlistEntry]:REAUTHENTICATION_RESOURCE_KIND.tribe,
  [REAUTHENTICATION_OPERATION.updateAllowlistEntry]:REAUTHENTICATION_RESOURCE_KIND.allowlistEntry,
  [REAUTHENTICATION_OPERATION.previewAllowlistImport]:REAUTHENTICATION_RESOURCE_KIND.tribe,
  [REAUTHENTICATION_OPERATION.confirmAllowlistImport]:REAUTHENTICATION_RESOURCE_KIND.allowlistImport,
  [REAUTHENTICATION_OPERATION.createPersonalInvitation]:REAUTHENTICATION_RESOURCE_KIND.tribe,
  [REAUTHENTICATION_OPERATION.renamePersonalInvitation]:REAUTHENTICATION_RESOURCE_KIND.personalInvitation,
  [REAUTHENTICATION_OPERATION.revokePersonalInvitation]:REAUTHENTICATION_RESOURCE_KIND.personalInvitation,
  [REAUTHENTICATION_OPERATION.advanceAdmissionRetry]:REAUTHENTICATION_RESOURCE_KIND.admissionRequest,
  [REAUTHENTICATION_OPERATION.exitAcademyMode]: REAUTHENTICATION_RESOURCE_KIND.tribe,
  [REAUTHENTICATION_OPERATION.deleteTribe]: REAUTHENTICATION_RESOURCE_KIND.tribe,
} as const satisfies Record<ReauthenticationOperation,(typeof REAUTHENTICATION_RESOURCE_KIND)[keyof typeof REAUTHENTICATION_RESOURCE_KIND]>;
