/** Serves guarded personal preview without emitting token URLs or invoking any mutation/issuer. @module personal-invitation-preview-handler */
import "server-only";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { personalInvitationPreviewParamsSchema, personalInvitationPreviewQuerySchema } from "../../constants/personal-invitation-preview-input";
import { personalInvitationOverviewSchema } from "../../constants/personal-invitation-overview-schemas";
import { PERSONAL_INVITATION_PREVIEW_OPERATION } from "../../constants/personal-invitation-overview";
import { personalInvitationPageStateSchema } from "../../constants/personal-invitation-page";
import { PERSONAL_INVITATION_VIEWER_HEADER, personalInvitationViewerMetadataSchema } from "../../constants/personal-invitation-browser";

/** The root supplies a read-only use case; body/session/role authority cannot be selected by request input. */
type PreviewServices = { page: { execute(query: { token: string; requestId: string; proofId?: string }): Promise<{ ok: true; value: unknown } | { ok: false; failure: AdmissionFailure }> } };
/** @param open - Native framework composition selected at the route. @returns No-store/no-referrer GET with own input/output guards and fixed diagnostic operation. */
export function createPersonalInvitationPreviewHandler(open: () => Promise<PreviewServices>) {
  return async function GET(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: PERSONAL_INVITATION_PREVIEW_OPERATION });
    try {
      const params = boundary.input("params", personalInvitationPreviewParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", personalInvitationPreviewQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const services = await open(), result = await services.page.execute({ token: params.value.token, requestId: boundary.requestContext.requestId, ...(query.value.proofId ? { proofId: query.value.proofId } : {}) });
      if (!result.ok) return boundary.failure(result.failure);
      const state = personalInvitationPageStateSchema.safeParse(result.value);
      if (!state.success || state.data.kind !== "ready") return boundary.success(personalInvitationOverviewSchema, null);
      const response = boundary.success(personalInvitationOverviewSchema, state.data.preview);
      response.headers.set(PERSONAL_INVITATION_VIEWER_HEADER, JSON.stringify(personalInvitationViewerMetadataSchema.parse({ viewerId: state.data.viewerId })));
      return response;
    } catch (error) { return boundary.unexpected(error); }
  };
}
