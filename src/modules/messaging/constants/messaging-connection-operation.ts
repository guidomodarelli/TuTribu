/** Limits readonly recovery to implemented connection mutations rather than an arbitrary shared ledger namespace. @module messaging-connection-operation */
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {VERIFICATION_ISSUANCE_OPERATION} from "@/src/modules/academy-admissions/constants/verification-issuance";
/** Only owners with a safe public result contract can be exposed to the wizard. */
export const MESSAGING_CONNECTION_OPERATION_TYPE=[REAUTHENTICATION_OPERATION.saveMessagingCredentials,REAUTHENTICATION_OPERATION.validateMessagingConnection,REAUTHENTICATION_OPERATION.configureMessagingConnection,REAUTHENTICATION_OPERATION.diagnoseMessagingConnection,REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic,REAUTHENTICATION_OPERATION.activateMessagingConnection] as const;
/** Two matches suffice to reject a UUID ambiguous between namespaces without scanning the whole ledger. */
export const MESSAGING_CONNECTION_OPERATION_MAXIMUM_MATCHES=2;
/** Shared durable namespaces require a separately recorded diagnostic purpose before recovery. */
export const MESSAGING_CONNECTION_ISSUANCE_LEDGER_TYPE=[VERIFICATION_ISSUANCE_OPERATION.issue,VERIFICATION_ISSUANCE_OPERATION.resend] as const;
/** Diagnostic authorization names are not durable issuance namespaces. */
export const MESSAGING_CONNECTION_DIRECT_LEDGER_TYPE=[REAUTHENTICATION_OPERATION.saveMessagingCredentials,REAUTHENTICATION_OPERATION.validateMessagingConnection,REAUTHENTICATION_OPERATION.configureMessagingConnection,REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic,REAUTHENTICATION_OPERATION.activateMessagingConnection] as const;
