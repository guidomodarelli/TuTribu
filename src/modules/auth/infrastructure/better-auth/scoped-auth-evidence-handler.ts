/** Scopes global authentication and persists only a native, matching login completion. */
import "server-only";
import {AUTH_EVIDENCE_CAPTURE_FAILURE,AUTH_EVIDENCE_FAILURE_KIND} from "@/src/modules/auth/constants/auth-evidence-capture";
import {GLOBAL_IDENTITY_CAPTURE_STATUS} from "@/src/modules/auth/constants/global-identity-evidence-persistence";
import {resolveRequestContext,type RequestContext} from "@/src/modules/shared/infrastructure/observability/request-context";
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
 * @returns A handler that closes additional evidence on failure while preserving valid login.
 * @throws The original native handler's failure when global authentication itself fails.
 */
export function createScopedAuthEvidenceHandler(handler:(request:Request)=>Promise<Response>,observers:AuthEvidenceHandlerObservers):(request:Request)=>Promise<Response> {
  return (request)=>runWithAuthEvidenceContext(async()=>{
    const response=await handler(request);
    const scope=getAuthEvidenceContext();
    const context=resolveRequestContext(request.headers);
    if(scope?.completedGoogleLogin) {
      try {
        const outcome=await observers.persist(scope.completedGoogleLogin);
        if(outcome.status===GLOBAL_IDENTITY_CAPTURE_STATUS.identityMismatch) scope.captureFailure={code:AUTH_EVIDENCE_CAPTURE_FAILURE.binding};
      } catch(error) {
        scope.captureFailure={code:AUTH_EVIDENCE_CAPTURE_FAILURE.persistence,failureKind:error instanceof Error?AUTH_EVIDENCE_FAILURE_KIND.exception:AUTH_EVIDENCE_FAILURE_KIND.unknownThrow};
      }
    }
    if(scope?.captureFailure) observers.reportFailure({...context,...scope.captureFailure});
    return response;
  });
}
