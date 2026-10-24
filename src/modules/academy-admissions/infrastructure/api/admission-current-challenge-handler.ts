/** Validates a same-origin exact-contact read without ledger claims or dispatch. @module admission-current-challenge-handler */
import "server-only";
import type { ReadCurrentAdmissionChallengeInput } from "../../application/use-cases/read-current-admission-challenge-use-case";
import { admissionCurrentChallengeSelectionSchema } from "../../application/results/admission-current-challenge-schemas";
import type { AdmissionVerificationHttpOutcome } from "./admission-contact-verification-handlers";
import { admissionCurrentChallengeInputSchema } from "../../constants/admission-current-challenge-input";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "../../constants/admission-route-input";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { admissionFailure } from "../../application/results/admission-errors";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import type { RequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";

/** Native composition provides only a reader and canonical tribe routing. */
export type AdmissionCurrentChallengeServices = { currentChallenge: { execute(input: ReadCurrentAdmissionChallengeInput): Promise<AdmissionVerificationHttpOutcome> }; resolveTribe: { execute(input: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | Extract<AdmissionVerificationHttpOutcome, { ok: false }>> } };

/** @param open - DB-only native composition. @returns A POST read whose contact never appears in query URLs and which cannot send a code. */
export function createAdmissionCurrentChallengeHandler(open: (context: RequestContext) => Promise<AdmissionCurrentChallengeServices>) {
  return async function POST(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.challengeSelect });
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const body = await boundary.readBody(admissionCurrentChallengeInputSchema);
      if (!body.usable) return body.response;
      const services = await open(boundary.requestContext), requestId = boundary.requestContext.requestId;
      const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!tribe.ok) return boundary.failure(tribe.failure);
      const outcome = await services.currentChallenge.execute({ ...body.value, tribeId: tribe.value.tribeId, requestId });
      return outcome.ok ? boundary.success(admissionCurrentChallengeSelectionSchema, outcome.value) : boundary.failure(outcome.failure);
    } catch (error) { return boundary.unexpected(error); }
  };
}
