/** Adds minimal signed evidence to the unchanged global Google authentication flow. */
import "server-only";
import type {BetterAuthPlugin} from "better-auth";
import {createAuthMiddleware,getOAuthState} from "better-auth/api";
import {GOOGLE_EVIDENCE_PLUGIN_ID,GOOGLE_IDENTITY_PROVIDER} from "@/src/modules/auth/constants/google-identity-evidence";
import {AUTH_EVIDENCE_CAPTURE_FAILURE,AUTH_EVIDENCE_CAPTURE_PATH,AUTH_EVIDENCE_FAILURE_KIND,AUTH_EVIDENCE_INTENT_STATE_KEY} from "@/src/modules/auth/constants/auth-evidence-capture";
import {getAuthEvidenceContext} from "./auth-evidence-context";
import {verifyGoogleIdTokenEvidence} from "./google-id-token-evidence-verifier";

/**
 * Decorates native Google without replacing authorization, state, PKCE or login decisions.
 * @returns A plugin holding original provider references; captures belong to each request.
 * @remarks Missing scope produces no capture. Persistence after account/session creation
 * belongs to the global auth owner and does not occur inside this provider decorator.
 */
export function googleIdentityEvidencePlugin():BetterAuthPlugin {
  return {
    id:GOOGLE_EVIDENCE_PLUGIN_ID,
    init(context) {
      return {context:{socialProviders:context.socialProviders.map((provider)=>{
        if(provider.id!==GOOGLE_IDENTITY_PROVIDER||!provider.verifyIdToken) return provider;
        const originalGetUserInfo=provider.getUserInfo;
        const originalVerifyIdToken=provider.verifyIdToken;
        return {
          ...provider,
          async getUserInfo(tokens) {
            const idToken=tokens.idToken;
            const scope=getAuthEvidenceContext();
            if(scope) {scope.googleEvidence=null;scope.completedGoogleLogin=null;scope.captureFailure=null;}
            const userInfo=await originalGetUserInfo(tokens);
            if(scope&&idToken) {
              // Preserve the mapped login, but derive evidence from the signed
              // token independently of any mutable profile mapping.
              try {
                scope.googleEvidence=await verifyGoogleIdTokenEvidence(idToken,{verifyIdToken:originalVerifyIdToken});
              } catch(error) {
                // Failure of additional evidence closes capture, preserving the native login.
                scope.captureFailure={code:AUTH_EVIDENCE_CAPTURE_FAILURE.verification,failureKind:error instanceof Error?AUTH_EVIDENCE_FAILURE_KIND.exception:AUTH_EVIDENCE_FAILURE_KIND.unknownThrow};
              }
            }
            return userInfo;
          },
        };
      })}};
    },
    hooks:{after:[{
      matcher:(context)=>(context.path===AUTH_EVIDENCE_CAPTURE_PATH.callback&&context.params?.id===GOOGLE_IDENTITY_PROVIDER)||context.path===AUTH_EVIDENCE_CAPTURE_PATH.socialSignIn,
      handler:createAuthMiddleware(async(context)=>{
        const scope=getAuthEvidenceContext();
        const result=scope?.googleEvidence;
        const login=context.context.newSession;
        if(!scope||result?.status!=="verified"||!login) return;
        const candidate=result.evidence;
        if(login.session.userId!==login.user.id||login.user.email.trim().toLowerCase()!==candidate.normalizedEmail) {
          scope.captureFailure={code:AUTH_EVIDENCE_CAPTURE_FAILURE.binding};
          return;
        }
        try {
          const account=await context.context.internalAdapter.findAccountByProviderId(candidate.subject,GOOGLE_IDENTITY_PROVIDER);
          if(!account||account.userId!==login.user.id||account.accountId!==candidate.subject||account.providerId!==GOOGLE_IDENTITY_PROVIDER) {
            scope.captureFailure={code:AUTH_EVIDENCE_CAPTURE_FAILURE.binding};
            return;
          }
          const oauthState=await getOAuthState();
          const opaqueIntent=oauthState?.[AUTH_EVIDENCE_INTENT_STATE_KEY];
          scope.completedGoogleLogin={userId:login.user.id,accountId:account.id,sessionId:login.session.id,evidence:candidate,reauthenticationIntentId:typeof opaqueIntent==="string"?opaqueIntent:null};
        } catch(error) {
          scope.captureFailure={code:AUTH_EVIDENCE_CAPTURE_FAILURE.lookup,failureKind:error instanceof Error?AUTH_EVIDENCE_FAILURE_KIND.exception:AUTH_EVIDENCE_FAILURE_KIND.unknownThrow};
        }
      }),
    }]},
  };
}
