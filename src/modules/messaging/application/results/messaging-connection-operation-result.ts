/** Guards each original connection namespace independently of mutable current configuration and private credential intent. @module messaging-connection-operation-result */
import {z} from "zod";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {MESSAGING_CONNECTION_OPERATION_TYPE} from "@/src/modules/messaging/constants/messaging-connection-operation";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {MESSAGING_CONNECTION_STATE} from "@/src/modules/messaging/constants/messaging-connection";
import {messagingConnectionMutationSchema} from "./messaging-connection-mutation-result";
import {messagingCredentialValidationSchema} from "./messaging-credential-validation-result";
import {messagingConnectionConfigurationSchema} from "./messaging-connection-configuration-result";
import {messagingConnectionActivationSchema} from "./messaging-connection-activation-result";
import {connectionDiagnosticIssuanceSchema} from "./connection-diagnostic-issuance-result";
import {connectionDiagnosticSnapshotSchema} from "./connection-diagnostic-result";

/** @param type - Exact implemented mutation namespace. @param result - Its own minimal DTO guard. @returns Strict original completed lookup with no current-state substitution. */
const completed=<Type extends typeof MESSAGING_CONNECTION_OPERATION_TYPE[number],Result>(type:Type,result:z.ZodType<Result>)=>z.strictObject({type:z.literal(type),state:z.literal(OPERATION_STATE.completed),operationId:z.uuid(),replayed:z.literal(true),result});
/** Keys and provider payloads are never a recovery input or output. */
export const messagingConnectionOperationRecoverySchema=z.union([
  z.strictObject({type:z.enum(MESSAGING_CONNECTION_OPERATION_TYPE),state:z.literal(OPERATION_STATE.started),operationId:z.uuid(),replayed:z.literal(true)}),
  completed(REAUTHENTICATION_OPERATION.saveMessagingCredentials,messagingConnectionMutationSchema.extend({version:z.literal(1),configurationVersion:z.literal(1),state:z.literal(MESSAGING_CONNECTION_STATE.draft)}).strict()),
  completed(REAUTHENTICATION_OPERATION.validateMessagingConnection,messagingCredentialValidationSchema.strict()),
  completed(REAUTHENTICATION_OPERATION.configureMessagingConnection,messagingConnectionConfigurationSchema.strict()),
  completed(REAUTHENTICATION_OPERATION.diagnoseMessagingConnection,connectionDiagnosticIssuanceSchema),
  completed(REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic,connectionDiagnosticSnapshotSchema),
  completed(REAUTHENTICATION_OPERATION.activateMessagingConnection,messagingConnectionActivationSchema.extend({state:z.literal(MESSAGING_CONNECTION_STATE.active)}).strict()),
]);
/** Browser/HTTP/SSR consumers receive only this guarded original snapshot. */
export type MessagingConnectionOperationRecovery=z.infer<typeof messagingConnectionOperationRecoverySchema>;
