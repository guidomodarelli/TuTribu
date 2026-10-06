/** Owns global one-use intents and signed operation-scoped recency. */
import type {GlobalReauthenticationIntent} from "../entities/global-reauthentication-intent";
import type {GoogleIdentityEvidenceCandidate} from "../entities/global-identity-evidence";
import type {RecentAuthenticationEvidence,RecentAuthenticationScope} from "../entities/recent-authentication-evidence";

/** Resolves allowed operations, resource ownership and return targets inside the writer transaction. */
export interface ReauthenticationResourceAuthorizer {
  resolve(scope:RecentAuthenticationScope):Promise<{allowedReturnPaths:readonly string[]}|null>;
}
export type CreateReauthenticationIntentCommand=RecentAuthenticationScope&{returnPath:string};
export type IssueReauthenticationNonceCommand=RecentAuthenticationScope&{intentId:string};
/** Signed candidate and effective session originate only in the native completion hook. */
export type CompleteGlobalReauthenticationCommand={intentId:string;userId:string;accountId:string;sessionId:string;evidence:GoogleIdentityEvidenceCandidate};
export type ReauthenticationClosedOutcome={status:"context_unavailable"|"intent_unusable"};

/** Keeps nonce issuance, one-use consumption and recency emission behind the auth owner. */
export interface RecentAuthenticationRepository {
  create(command:CreateReauthenticationIntentCommand):Promise<{status:"created";intent:GlobalReauthenticationIntent}|ReauthenticationClosedOutcome>;
  issueNonce(command:IssueReauthenticationNonceCommand):Promise<{status:"authorizing";nonce:string}|ReauthenticationClosedOutcome>;
  complete(command:CompleteGlobalReauthenticationCommand):Promise<{status:"consumed";evidence:RecentAuthenticationEvidence|null}|ReauthenticationClosedOutcome>;
}
