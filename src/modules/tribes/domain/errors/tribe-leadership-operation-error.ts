/** Keeps transfer failures typed and private diagnostics separate from a future public message. @module tribe-leadership-operation-error */
import { TRIBE_LEADERSHIP_ERROR_CODE } from "../../constants/tribe-leadership";

/** A caller may preserve progress only when it independently binds operationId to its original transfer. */
export class TribeLeadershipOperationError extends Error{
  /** Closed failure for mapping at the boundary that owns the user response. */
  readonly code:typeof TRIBE_LEADERSHIP_ERROR_CODE[keyof typeof TRIBE_LEADERSHIP_ERROR_CODE];
  /** Original public operation reference, never a private ledger/session id. */
  readonly operationId:string|undefined;
  /** @param code - Closed semantic transfer failure. @param options - Private original cause and optional durably known public operation. */
  constructor(code:typeof TRIBE_LEADERSHIP_ERROR_CODE[keyof typeof TRIBE_LEADERSHIP_ERROR_CODE],options:{cause?:unknown;operationId?:string}={}){super(`TribeLeadership.transfer failed: ${code}`,{cause:options.cause});this.name="TribeLeadershipOperationError";this.code=code;this.operationId=options.operationId;}
}
