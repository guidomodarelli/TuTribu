/** Scopes global authentication and persists only a native, matching login completion. */
import "server-only";
import {AUTH_EVIDENCE_CAPTURE_FAILURE,AUTH_EVIDENCE_FAILURE_KIND} from "@/src/modules/auth/constants/auth-evidence-capture";
import {GLOBAL_IDENTITY_CAPTURE_STATUS} from "@/src/modules/auth/constants/global-identity-evidence-persistence";
import type {RequestContext} from "@/src/modules/shared/infrastructure/observability/request-context";
import {resolvePrivateRequestContext} from "@/src/modules/shared/infrastructure/observability/private-request-context";
import {runWithBetterAuthLoggingContext} from "./better-auth-logger";
import {projectPublicAuthResponse} from "./public-auth-session-response";
import {getAuthEvidenceContext,runWithAuthEvidenceContext,type AuthEvidenceCaptureFailure,type CompletedGoogleLogin} from "./auth-evidence-context";

/** Contains only safe correlation and the capture outcome, never a raw cause or profile. */
export type AuthEvidenceFailureDiagnostic=AuthEvidenceCaptureFailure&RequestContext;
/** Injects persistence and diagnostics at the owning infrastructure composition root. */
export type AuthEvidenceHandlerObservers={
  persist:(completion:CompletedGoogleLogin)=>Promise<{status:"stored"|"identity_mismatch"}>;
  reportFailure:(failure:AuthEvidenceFailureDiagnostic)=>void;
};

/**
 * Wraps the unchanged native handler with a fresh private capture store per request.
 * @param handler - Existing global Better Auth handler, preserving its response and cookies.
 * @param observers - Own persistence and safe diagnostic boundaries.
 * @returns A handler that preserves native auth decisions/cookies while exposing only safe own session DTOs.
 * @throws The original native handler's failure when global authentication itself fails.
 */
export function createScopedAuthEvidenceHandler(handler:(request:Request)=>Promise<Response>,observers:AuthEvidenceHandlerObservers):(request:Request)=>Promise<Response> {
  return (request)=>{
    const context=resolvePrivateRequestContext(request.headers);
    return runWithBetterAuthLoggingContext(context,()=>runWithAuthEvidenceContext(async()=>{
    const response=await handler(request);
    const scope=getAuthEvidenceContext();
    if(scope?.completedGoogleLogin) {
      try {
        const outcome=await observers.persist(scope.completedGoogleLogin);
        if(outcome.status===GLOBAL_IDENTITY_CAPTURE_STATUS.identityMismatch) scope.captureFailure={code:AUTH_EVIDENCE_CAPTURE_FAILURE.binding};
      } catch(error) {
        scope.captureFailure={code:AUTH_EVIDENCE_CAPTURE_FAILURE.persistence,failureKind:error instanceof Error?AUTH_EVIDENCE_FAILURE_KIND.exception:AUTH_EVIDENCE_FAILURE_KIND.unknownThrow};
      }
    }
    if(scope?.captureFailure) observers.reportFailure({...context,...scope.captureFailure});
    return projectPublicAuthResponse(request,response,context);
    }));
  };
}
