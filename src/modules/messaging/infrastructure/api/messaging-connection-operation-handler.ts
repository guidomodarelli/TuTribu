/** Exposes original connection recovery without credential input, leases or browser-selected namespaces. @module messaging-connection-operation-handler */
import "server-only";
import type {ReadMessagingConnectionOperationUseCase} from "../../application/use-cases/read-messaging-connection-operation-use-case";
import type {MessagingUsagePolicyServices} from "./messaging-usage-policy-handlers";
import {messagingConnectionOperationRecoverySchema} from "../../application/results/messaging-connection-operation-result";
import {createMessagingOperationReadHandler,MESSAGING_OPERATION_READ_INPUT} from "./messaging-operation-read-handler";
import {MESSAGING_ERROR_CODE} from "../../constants/messaging-errors";
import {messagingFailure} from "../../application/results/messaging-errors";
import {MESSAGING_HTTP_OPERATION} from "../../constants/messaging-http";

/** @param open - Native readonly services after own route validation. @returns Original guarded metadata or safe current denial, without another write or key input. */
export function createMessagingConnectionOperationHandler(open:()=>Promise<{resolveTribe:MessagingUsagePolicyServices["resolveTribe"];operation:Pick<ReadMessagingConnectionOperationUseCase,"execute">}>){
  return createMessagingOperationReadHandler({
    ...MESSAGING_OPERATION_READ_INPUT,operation:MESSAGING_HTTP_OPERATION.connectionOperationRead,
    /** Even an own service cannot cross the requested UUID. */
    respond:(boundary,value,operationId)=>{
      const parsed=messagingConnectionOperationRecoverySchema.safeParse(value);if(!parsed.success||parsed.data.operationId.toLowerCase()!==operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      return boundary.success(messagingConnectionOperationRecoverySchema,parsed.data);
    },
  },open);
}
