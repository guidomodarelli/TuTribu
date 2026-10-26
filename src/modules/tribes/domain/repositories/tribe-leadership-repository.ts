/** Defines the tribe owner's atomic canonical leadership boundary without transport or storage details. @module tribe-leadership-repository */
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { TRIBE_FORMER_LEADER_ROLE } from "../../constants/tribe-leadership";

/** Identity originates in native auth; no email, creator flag, credential or Google token crosses this port. */
export type TribeLeadershipTransferContext={tribeId:string;actorUserId:string;sessionId:string;requestId:string};
/** CAS uses the current canonical leader identity; the target must already be an active member of this same tribe. */
export type TribeLeadershipTransferInput={operationId:string;expectedLeaderUserId:string;nextLeaderUserId:string;formerLeaderRole:typeof TRIBE_FORMER_LEADER_ROLE[number];confirmed:boolean};
/** Original committed metadata is historical, without granting current authority or transferring any secret. */
export type TribeLeadershipTransferResult={previousLeaderUserId:string;leaderUserId:string;formerLeaderRole:typeof TRIBE_FORMER_LEADER_ROLE[number];suspendedConnectionIds:string[]};
/** The writer rechecks current session/leader/target under the shared tribe fence and commits roles, suspension and original result together. */
export interface TribeLeadershipWriter{
  /** @param context - Actual native actor/session and fixed tribe scope. @param input - Confirmed original UUID/CAS/target and former role. @returns Original completed metadata or genuine durable unfinished work, never an automatic retry. */
  transfer(context:TribeLeadershipTransferContext,input:TribeLeadershipTransferInput):Promise<AdmissionOperationResult<TribeLeadershipTransferResult>>;
}
