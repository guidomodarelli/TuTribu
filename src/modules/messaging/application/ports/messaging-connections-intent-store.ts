/** Persists only the original operation reference required after navigation or a lost response, never a key or recipient. @module messaging-connections-intent-store */
/** The backend still owns authorization; this reference grants no permission. */
export type MessagingConnectionsPendingIntent=
  |{type:"save_messaging_credentials";operationId:string;original?:{name:string}}
  |{type:"validate_messaging_connection";operationId:string;original?:{connectionId:string;configurationVersion:number;expectedVersion:number}}
  |{type:"configure_messaging_connection";operationId:string;original?:{connectionId:string;configurationVersion:number;expectedVersion:number;channel:"email"|"sms"|"whatsapp";senderId:string;templateId?:string;templateLanguage?:string}}
  |{type:"activate_messaging_connection";operationId:string;original:{connectionId:string;configurationVersion:number;expectedVersion:number}}
  |{type:"diagnose_messaging_connection";operationId:string;original:{connectionId:string;configurationVersion:number;expectedVersion:number;channel:"email"|"sms"|"whatsapp"}}
  |{type:"verify_messaging_diagnostic";operationId:string;original:{connectionId:string;configurationVersion:number;diagnosticId:string;channel:"email"|"sms"|"whatsapp"}};
/** An issued diagnostic is recovered through its original ledger result; no destination/code belongs here. */
export type MessagingDiagnosticObservationReference={operationId:string;connectionId:string;configurationVersion:number;channel:"email"|"sms"|"whatsapp"};
export interface MessagingConnectionsIntentStore{
  /** @param viewerId - Current verified own viewer. @param slug - Current route scope. @returns A validated original reference or absence. */
  read(viewerId:string,slug:string):MessagingConnectionsPendingIntent|null;
  /** @param viewerId - Current verified own viewer. @param slug - Current route scope. @param intent - Metadata only, or null to clear this owned scope. @returns Whether the reference was saved/cleared safely. */
  write(viewerId:string,slug:string,intent:MessagingConnectionsPendingIntent|null):boolean;
  /** @param viewerId - Current own viewer. @param slug - Current route. @returns Preserved historical references, never completed/rollback claims. */
  history(viewerId:string,slug:string):MessagingConnectionsPendingIntent[];
  /** @param viewerId - Current own viewer. @param slug - Current route. @param intent - Exact original public metadata. @returns Whether it was preserved before the pending reference can be cleared. */
  archive(viewerId:string,slug:string,intent:MessagingConnectionsPendingIntent):boolean;
  /** @param viewerId - Current own viewer. @param slug - Current route. @returns A safe issued-operation reference for return from Google, without another send. */
  diagnostic(viewerId:string,slug:string):MessagingDiagnosticObservationReference|null;
  /** @param viewerId - Current own viewer. @param slug - Exact current route. @returns Preserved issued references for explicit original lookup, without contact or code. */
  diagnostics(viewerId:string,slug:string):MessagingDiagnosticObservationReference[];
  /** @param viewerId - Current own viewer. @param slug - Current route. @param reference - Issuance reference only, or null to clear it. @returns Whether it was safely retained for original lookup. */
  writeDiagnostic(viewerId:string,slug:string,reference:MessagingDiagnosticObservationReference|null):boolean;
}
