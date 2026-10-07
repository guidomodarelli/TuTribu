/** Defines minimal owned transport reads for a canonical leader or the owner of the associated challenge. @module message-delivery-reader */
/** Server identity is rechecked under actual native SQL; this is never a browser permission token. */
export type MessageDeliveryReadContext={actorUserId:string;sessionId:string;tribeId:string;requestId:string};
/** This port grants no sender, SecretStore, claim, reservation or mutation capability. */
export interface MessageDeliveryReader<Result>{
  /** @param context - Current native account/session and exact tenant. @param deliveryId - Exact own requested transport resource. @returns Guarded minimal metadata or absence, without another provider request. */
  read(context:MessageDeliveryReadContext,deliveryId:string):Promise<Result|null>;
}
