/** Validates wizard runtime input and own SSR metadata without session/provider DTO serialization. @module messaging-connections-page */
import "server-only";
import {z} from "zod";
import type {GetMessagingConnectionsPageUseCase} from "../../application/use-cases/get-messaging-connections-page-use-case";
import {messagingConnectionsPageStateSchema,type MessagingConnectionsPageState} from "../../application/results/messaging-connections-page-state";
import {messagingTribeParamsSchema} from "../api/messaging-request-schemas";
import {MESSAGING_ERROR_CODE,MESSAGING_ERROR_MESSAGE} from "../../constants/messaging-errors";
import {resolveRequestContext} from "@/src/modules/shared/infrastructure/observability/request-context";
import {createServerLogger} from "@/src/modules/shared/infrastructure/observability/server-logger";

/** Browser role, actor, readiness and key inputs are forbidden on a read-only page. */
const pageInputSchema=z.strictObject({params:messagingTribeParamsSchema,query:z.strictObject({})});
/** @param input - Untrusted resolved runtime values. @param open - Native single metadata entrypoint. @returns Safe Spanish own state with no partial private result or implicit initialization. */
export async function loadMessagingConnectionsPageState(input:unknown,open:()=>Promise<Pick<GetMessagingConnectionsPageUseCase,"execute">>):Promise<MessagingConnectionsPageState>{
  const failure=(code:typeof MESSAGING_ERROR_CODE[keyof typeof MESSAGING_ERROR_CODE]):MessagingConnectionsPageState=>({kind:"unavailable",code,message:MESSAGING_ERROR_MESSAGE[code]}),parsed=pageInputSchema.safeParse(input);if(!parsed.success)return failure(MESSAGING_ERROR_CODE.invalidInput);
  const context=resolveRequestContext(new Headers());
  try{
    const page=await open(),result=await page.execute({slug:parsed.data.params.slug,requestId:context.requestId});if(!result.ok)return failure(result.failure.code);
    const projected=messagingConnectionsPageStateSchema.safeParse(result.value);if(projected.success)return projected.data;
    createServerLogger({feature:"messaging",operation:"load_messaging_connections_page",...context}).error({message:"Connection wizard returned an unusable own state",metadata:{code:MESSAGING_ERROR_CODE.publicContractUnusable}});return failure(MESSAGING_ERROR_CODE.publicContractUnusable);
  }catch{createServerLogger({feature:"messaging",operation:"load_messaging_connections_page",...context}).error({message:"Connection wizard metadata could not load",metadata:{code:MESSAGING_ERROR_CODE.unexpectedFailure}});return failure(MESSAGING_ERROR_CODE.unexpectedFailure);}
}
