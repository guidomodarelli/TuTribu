/** Exposes original connection recovery without credential input, leases or browser-selected namespaces. @module messaging-connection-operation-handler */
import "server-only";
import {z} from "zod";
import type {ReadMessagingConnectionOperationUseCase} from "../../application/use-cases/read-messaging-connection-operation-use-case";
import type {MessagingUsagePolicyServices} from "./messaging-usage-policy-handlers";
import {messagingTribeParamsSchema} from "./messaging-request-schemas";
import {messagingConnectionOperationRecoverySchema} from "../../application/results/messaging-connection-operation-result";
import {createMessagingRouteBoundary} from "./messaging-route-http";
import {MESSAGING_ERROR_CODE} from "../../constants/messaging-errors";
import {messagingFailure} from "../../application/results/messaging-errors";
import {MESSAGING_HTTP_OPERATION} from "../../constants/messaging-http";

/** Input owns only canonical route identity; role/actor/namespace filters are forbidden. */
const operationParamsSchema=messagingTribeParamsSchema.extend({operationId:z.uuid()}),emptyQuerySchema=z.strictObject({});
/** @param open - Native readonly services after own route validation. @returns Original guarded metadata or safe current denial, without another write or key input. */
export function createMessagingConnectionOperationHandler(open:()=>Promise<{resolveTribe:MessagingUsagePolicyServices["resolveTribe"];operation:Pick<ReadMessagingConnectionOperationUseCase,"execute">}>){
  /** @param request - Exact original UUID with no authority query. @param context - Own unresolved framework route. @returns No-store original state; even an own service cannot cross the requested UUID. */
  return async function GET(request:Request,context:{params:Promise<{slug:string;operationId:string}>}):Promise<Response>{
    const boundary=createMessagingRouteBoundary({request,operation:MESSAGING_HTTP_OPERATION.connectionOperationRead});
    try{
      const params=boundary.input("params",operationParamsSchema,await context.params);if(!params.usable)return params.response;
      const query=boundary.input("query",emptyQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
      const services=await open(),requestId=boundary.requestContext.requestId,tribe=await services.resolveTribe.execute({slug:params.value.slug,requestId});
      if(!tribe.ok)return boundary.failure(messagingFailure(Object.values(MESSAGING_ERROR_CODE).find((code)=>code===tribe.failure.code)??MESSAGING_ERROR_CODE.unexpectedFailure,{cause:tribe.failure}));
      const outcome=await services.operation.execute({tribeId:tribe.value.tribeId,operationId:params.value.operationId,requestId});if(!outcome.ok)return boundary.failure(outcome.failure);
      const parsed=messagingConnectionOperationRecoverySchema.safeParse(outcome.value);if(!parsed.success||parsed.data.operationId.toLowerCase()!==params.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      return boundary.success(messagingConnectionOperationRecoverySchema,parsed.data);
    }catch(error){return boundary.unexpected(error);}
  };
}
