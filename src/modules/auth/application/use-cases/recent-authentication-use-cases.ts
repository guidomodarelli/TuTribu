/** Orchestrates owned global intent creation and read-only safe status without provider DTOs. */
import type {AuthenticatedAccountProvider} from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import type {RecentAuthenticationRepository} from "@/src/modules/auth/domain/repositories/recent-authentication-repository";
import type {GlobalReauthenticationIntent} from "@/src/modules/auth/domain/entities/global-reauthentication-intent";
import {evaluateRecentAuthentication} from "@/src/modules/auth/domain/policies/recent-authentication";
import {GLOBAL_REAUTHENTICATION_INTENT_STATE} from "@/src/modules/auth/constants/recent-authentication";
import {REAUTHENTICATION_ERROR_CODE,REAUTHENTICATION_INTENT_MESSAGE,REAUTHENTICATION_INTENT_OUTCOME} from "@/src/modules/auth/constants/reauthentication-intents";
import type {ReauthenticationIntentResult,ReauthenticationIntentUseCaseResult} from "@/src/modules/auth/application/results/reauthentication-intent-result";

/** Maps state explicitly so a consumed callback cannot masquerade as verified recency. */
function projectIntent(intent:GlobalReauthenticationIntent,outcome:ReauthenticationIntentResult["outcome"],validUntil?:Date):ReauthenticationIntentResult {
  const message=outcome===REAUTHENTICATION_INTENT_OUTCOME.verified?REAUTHENTICATION_INTENT_MESSAGE.verified:outcome===REAUTHENTICATION_INTENT_OUTCOME.required?REAUTHENTICATION_INTENT_MESSAGE.required:outcome===REAUTHENTICATION_INTENT_OUTCOME.expired?REAUTHENTICATION_INTENT_MESSAGE.expired:REAUTHENTICATION_INTENT_MESSAGE.pending;
  return {intentId:intent.id,state:intent.status,outcome,safeMessage:message,returnPath:intent.returnPath,...(validUntil?{validUntil:validUntil.toISOString()}:{})};
}

/** Creates one explicitly requested intent from current private auth facts. */
export class CreateReauthenticationIntentUseCase {
  /** @param accounts - Current private auth projection. @param intents - Authoritative current resource/identity writer. */
  constructor(private readonly accounts:AuthenticatedAccountProvider,private readonly intents:RecentAuthenticationRepository) {}
  /**
   * Derives account/session identity from the server and lets the writer revalidate resource/return.
   * @param command - Validated action/resource/return only; no browser identity or permission flag.
   * @returns Safe pending intent or a closed failure before writes.
   */
  async execute(command:{tribeId:string;operation:string;resourceId:string;returnPath:string}):Promise<ReauthenticationIntentUseCaseResult> {
    const account=await this.accounts.getAuthenticatedAccount();
    if(!account) return {ok:false,failure:{code:REAUTHENTICATION_ERROR_CODE.notAuthenticated}};
    if(!account.googleAccount) return {ok:false,failure:{code:REAUTHENTICATION_ERROR_CODE.required}};
    const result=await this.intents.create({...command,userId:account.userId,sessionId:account.session.id,accountId:account.googleAccount.id,subject:account.googleAccount.subject});
    if(result.status!=="created") return {ok:false,failure:{code:REAUTHENTICATION_ERROR_CODE.contextUnavailable}};
    return {ok:true,value:projectIntent(result.intent,REAUTHENTICATION_INTENT_OUTCOME.pending)};
  }
}

/** Begins only a current owned intent, handing plaintext nonce exclusively to the native OAuth adapter. */
export class BeginGlobalReauthenticationUseCase {
  /** @param accounts - Current private auth context. @param intents - Transactional nonce issuer. */
  constructor(private readonly accounts:AuthenticatedAccountProvider,private readonly intents:RecentAuthenticationRepository) {}
  /**
   * Re-resolves the opaque browser reference before issuing a server-controlled nonce.
   * @param command - Validated intent id, without browser identity or nonce.
   * @returns Private nonce for the original OAuth URL, or a closed outcome without issuance.
   */
  async execute(command:{intentId:string}):Promise<{allowed:true;nonce:string}|{allowed:false}> {
    const account=await this.accounts.getAuthenticatedAccount();
    if(!account?.googleAccount) return {allowed:false};
    const identity={userId:account.userId,sessionId:account.session.id,accountId:account.googleAccount.id,subject:account.googleAccount.subject};
    const intent=await this.intents.read({...command,...identity});
    if(!intent||intent.originalSessionId!==account.session.id||intent.status!==GLOBAL_REAUTHENTICATION_INTENT_STATE.created) return {allowed:false};
    const issued=await this.intents.issueNonce({...identity,intentId:intent.id,tribeId:intent.tribeId,operation:intent.operation,resourceId:intent.resourceId});
    return issued.status===GLOBAL_REAUTHENTICATION_INTENT_STATE.authorizing?{allowed:true,nonce:issued.nonce}:{allowed:false};
  }
}

/** Reads only owned current state; UI verification is never a permission for a sensitive mutation. */
export class ReadReauthenticationIntentUseCase {
  /** @param accounts - Current private session/account/evidence. @param intents - Authorized read-only repository. @param clock - Evaluated after all awaited readers. */
  constructor(private readonly accounts:AuthenticatedAccountProvider,private readonly intents:RecentAuthenticationRepository,private readonly clock:()=>Date) {}
  /**
   * Projects current intent state and exact-session operation recency without effects.
   * @param command - Validated opaque intent reference.
   * @returns Pending/verified/required/expired public state, or an audience-safe failure.
   */
  async execute(command:{intentId:string}):Promise<ReauthenticationIntentUseCaseResult> {
    const account=await this.accounts.getAuthenticatedAccount();
    if(!account) return {ok:false,failure:{code:REAUTHENTICATION_ERROR_CODE.notAuthenticated}};
    if(!account.googleAccount) return {ok:false,failure:{code:REAUTHENTICATION_ERROR_CODE.required}};
    const intent=await this.intents.read({...command,userId:account.userId,sessionId:account.session.id,accountId:account.googleAccount.id,subject:account.googleAccount.subject});
    if(!intent) return {ok:false,failure:{code:REAUTHENTICATION_ERROR_CODE.notFound}};
    const now=this.clock();
    if(intent.status===GLOBAL_REAUTHENTICATION_INTENT_STATE.expired||(intent.status!==GLOBAL_REAUTHENTICATION_INTENT_STATE.consumed&&now.getTime()>=intent.expiresAt.getTime())) return {ok:true,value:projectIntent({...intent,status:GLOBAL_REAUTHENTICATION_INTENT_STATE.expired},REAUTHENTICATION_INTENT_OUTCOME.expired)};
    if(intent.status!==GLOBAL_REAUTHENTICATION_INTENT_STATE.consumed) return {ok:true,value:projectIntent(intent,REAUTHENTICATION_INTENT_OUTCOME.pending)};
    const scope={userId:account.userId,sessionId:account.session.id,accountId:account.googleAccount.id,subject:account.googleAccount.subject,tribeId:intent.tribeId,operation:intent.operation,resourceId:intent.resourceId};
    const evidence=account.recentAuthentication.find((candidate)=>candidate.intentId===intent.id&&evaluateRecentAuthentication({now,scope,evidence:candidate,sessionActive:now<account.session.expiresAt,currentLeaderUserId:account.userId}).allowed);
    return {ok:true,value:projectIntent(intent,evidence?REAUTHENTICATION_INTENT_OUTCOME.verified:REAUTHENTICATION_INTENT_OUTCOME.required,evidence?.validUntil)};
  }
}
