/** Validates a same-origin exact-contact read without ledger claims or dispatch. @module admission-current-challenge-handler */
import "server-only";
import type { ReadCurrentAdmissionChallengeInput } from "../../application/use-cases/read-current-admission-challenge-use-case";
import { admissionCurrentChallengeSelectionSchema } from "../../application/results/admission-current-challenge-schemas";
import type { AdmissionVerificationHttpOutcome } from "./admission-contact-verification-handlers";
import { admissionCurrentChallengeInputSchema } from "../../constants/admission-current-challenge-input";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "../../constants/admission-route-input";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { openAdmissionTribeCommand, respondWithAdmissionResult } from "./admission-route-steps";
import type { AdmissionTribeRouting } from "../../application/use-cases/admission-tribe-scope";
import type { RequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";

/** Native composition provides only a reader and canonical tribe routing. */
export type AdmissionCurrentChallengeServices = { currentChallenge: { execute(input: ReadCurrentAdmissionChallengeInput): Promise<AdmissionVerificationHttpOutcome> }; resolveTribe: AdmissionTribeRouting };

/** @param open - DB-only native composition. @returns A POST read whose contact never appears in query URLs and which cannot send a code. */
export function createAdmissionCurrentChallengeHandler(open: (context: RequestContext) => Promise<AdmissionCurrentChallengeServices>) {
  return async function POST(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.challengeSelect });
    try {
      const route = await openAdmissionTribeCommand(boundary, { request, params: context.params }, { params: admissionTribeParamsSchema, query: admissionEmptyQuerySchema, body: admissionCurrentChallengeInputSchema }, () => open(boundary.requestContext));
      if ("response" in route) return route.response;
      return respondWithAdmissionResult(boundary, admissionCurrentChallengeSelectionSchema, await route.services.currentChallenge.execute({ ...route.body, ...route.scope }));
    } catch (error) { return boundary.unexpected(error); }
  };
}
