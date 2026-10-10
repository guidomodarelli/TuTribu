/** Binds native session identity to one explicit original transfer; the tribe writer retains final role and transaction authority. @module transfer-tribe-leadership-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { TribeLeadershipTransferInput, TribeLeadershipWriter } from "../../domain/repositories/tribe-leadership-repository";
import { TribeLeadershipOperationError } from "../../domain/errors/tribe-leadership-operation-error";
import { TRIBE_FORMER_LEADER_ROLE, TRIBE_LEADERSHIP_ERROR_CODE } from "../../constants/tribe-leadership";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** Resolves no provider or key and never creates members, invitations or product grants. */
export class TransferTribeLeadershipUseCase{
  /** @param accounts - Current native account port. @param writer - Atomic current-authority owner. @param now - Clock sampled after identity resolution. */
  constructor(private readonly accounts:AuthenticatedAccountProvider,private readonly writer:TribeLeadershipWriter,private readonly now:()=>Date=()=>new Date()){}
  /** @param command - Fixed tenant/correlation plus explicitly confirmed original transfer. @returns Historical original outcome with current identity privately bound to the writer. @throws TribeLeadershipOperationError with closed failure and only genuine original progress. */
  async execute(command:TribeLeadershipTransferInput&{tribeId:string;requestId:string}){
    try{
      const account=await this.accounts.getAuthenticatedAccount();
      if(!account||!isAuthenticatedSessionLive(account.session.expiresAt,this.now()))throw new TribeLeadershipOperationError(TRIBE_LEADERSHIP_ERROR_CODE.authenticationRequired);
      if(command.expectedLeaderUserId!==account.userId)throw new TribeLeadershipOperationError(TRIBE_LEADERSHIP_ERROR_CODE.leadershipConflict);
      if(!command.confirmed||command.nextLeaderUserId===account.userId||!TRIBE_FORMER_LEADER_ROLE.includes(command.formerLeaderRole))throw new TribeLeadershipOperationError(TRIBE_LEADERSHIP_ERROR_CODE.invalidInput);
      const{tribeId,requestId}=command,input:TribeLeadershipTransferInput={operationId:command.operationId,expectedLeaderUserId:command.expectedLeaderUserId,nextLeaderUserId:command.nextLeaderUserId,formerLeaderRole:command.formerLeaderRole,confirmed:command.confirmed};
      const result=await this.writer.transfer({tribeId,requestId,actorUserId:account.userId,sessionId:account.session.id},input);
      if(result.operationId!==input.operationId||result.state===OPERATION_STATE.completed&&(result.result.previousLeaderUserId!==input.expectedLeaderUserId||result.result.leaderUserId!==input.nextLeaderUserId||result.result.formerLeaderRole!==input.formerLeaderRole))throw new TribeLeadershipOperationError(TRIBE_LEADERSHIP_ERROR_CODE.publicContractUnusable);
      return result;
    }catch(error){
      if(error instanceof TribeLeadershipOperationError&&(error.code!==TRIBE_LEADERSHIP_ERROR_CODE.operationUnresolved||error.operationId===command.operationId))throw error;
      throw new TribeLeadershipOperationError(TRIBE_LEADERSHIP_ERROR_CODE.unexpectedFailure,{cause:error});
    }
  }
}
