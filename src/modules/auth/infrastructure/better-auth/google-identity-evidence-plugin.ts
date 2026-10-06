/** Adds minimal signed evidence to the unchanged global Google authentication flow. */
import "server-only";
import type {BetterAuthPlugin} from "better-auth";
import {GOOGLE_EVIDENCE_PLUGIN_ID,GOOGLE_IDENTITY_PROVIDER} from "@/src/modules/auth/constants/google-identity-evidence";
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
            if(scope) scope.googleEvidence=null;
            const userInfo=await originalGetUserInfo(tokens);
            if(scope&&idToken) {
              // Preserve the mapped login, but derive evidence from the signed
              // token independently of any mutable profile mapping.
              scope.googleEvidence=await verifyGoogleIdTokenEvidence(idToken,{
                verifyIdToken:originalVerifyIdToken,
              });
            }
            return userInfo;
          },
        };
      })}};
    },
  };
}
