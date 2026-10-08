/** Persists only the original operation reference required after navigation or a lost response, never a key or recipient. @module messaging-connections-intent-store */
/** The backend still owns authorization; this reference grants no permission. */
export type MessagingConnectionsPendingIntent={type:"save_messaging_credentials"|"validate_messaging_connection";operationId:string};
export interface MessagingConnectionsIntentStore{
  /** @param viewerId - Current verified own viewer. @param slug - Current route scope. @returns A validated original reference or absence. */
  read(viewerId:string,slug:string):MessagingConnectionsPendingIntent|null;
  /** @param viewerId - Current verified own viewer. @param slug - Current route scope. @param intent - Metadata only, or null to clear this owned scope. @returns Whether the reference was saved/cleared safely. */
  write(viewerId:string,slug:string,intent:MessagingConnectionsPendingIntent|null):boolean;
}
