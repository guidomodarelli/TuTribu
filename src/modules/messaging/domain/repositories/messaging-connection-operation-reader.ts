/** Defines original readonly connection recovery without keys, leases, provider calls or reauthentication. @module messaging-connection-operation-reader */
import type {MessagingUsageContext} from "./messaging-usage-operations";
/** No mutation capability is available to an original-result lookup. */
export interface MessagingConnectionOperationReader{
  /** @param context - Current exact native actor/session/tribe. @param operationId - Original caller UUID. @returns Only that actor's allowed original public result, genuine registered progress or absence. */
  read(context:MessagingUsageContext,operationId:string):Promise<unknown|null>;
}
