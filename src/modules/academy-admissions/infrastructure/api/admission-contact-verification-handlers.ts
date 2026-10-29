/** Projects explicit applicant contact verification and proof attachment through own native HTTP contracts. @module admission-contact-verification-handlers */
import "server-only";
import type { z } from "zod";
import { type AdmissionFailure, admissionFailure  } from "../../application/results/admission-errors";
import type { ContactVerificationUseCases, IssueAdmissionContactChallengeInput, VerifyAdmissionContactChallengeInput, ResendAdmissionContactChallengeInput } from "../../application/use-cases/contact-verification-use-cases";
import type { ApplyAdmissionProofInput } from "../../application/use-cases/apply-admission-proof-use-case";
import { admissionChallengeSnapshotSchema, admissionVerifiedContactSchema } from "../../application/results/admission-contact-verification-schemas";
import { admissionProofApplicationSnapshotSchema } from "../../application/results/admission-proof-application-schemas";
import { createAdmissionOperationStateSchema } from "../../application/results/admission-flow-result-schemas";
import { admissionTribeParamsSchema, admissionChallengeParamsSchema, admissionRequestParamsSchema, admissionEmptyQuerySchema, admissionChallengeCreateSchema, admissionChallengeVerifySchema, admissionChallengeResendSchema, admissionProofAttachmentSchema } from "./admission-request-schemas";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { type AdmissionRouteBoundary, readAdmissionRouteInput, openAdmissionTribeCommand, readAdmissionBodyInTribeScope } from "./admission-route-steps";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import type { AdmissionTribeRouting } from "../../application/use-cases/admission-tribe-scope";
import type { RequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";

/** Own application outcomes retain private failure causes until the common HTTP boundary projects them. */
export type AdmissionVerificationHttpOutcome = { ok: true; value: unknown } | { ok: false; failure: AdmissionFailure };
/** Canonical routing selects only a tribe; applicant identity remains inside the native use case. */
type AdmissionVerificationRouting = { resolveTribe: AdmissionTribeRouting };
/** Transport composition exists only for issuance/resend; local verification never invokes its dispatcher. */
type ContactVerificationServices = AdmissionVerificationRouting & { verification: { issue(input: IssueAdmissionContactChallengeInput): Promise<AdmissionVerificationHttpOutcome>; verify(input: VerifyAdmissionContactChallengeInput): Promise<AdmissionVerificationHttpOutcome>; resend(input: ResendAdmissionContactChallengeInput): Promise<AdmissionVerificationHttpOutcome> } };
/** Attachment has a separate DB-only composition and cannot send a message. */
type ProofApplicationServices = AdmissionVerificationRouting & { applyProof: { execute(input: ApplyAdmissionProofInput): Promise<AdmissionVerificationHttpOutcome> } };
/** Canonicalizes only this proof route's own UUID reference without changing other request entrypoint contracts. */
const proofAttachmentParamsSchema = admissionRequestParamsSchema.transform((params) => ({ ...params, requestId: params.requestId.toLowerCase() }));

/** @param boundary - Current native own JSON boundary. @returns A safe denial for caller origin before composition. */
function denyOrigin(boundary: AdmissionRouteBoundary): Response { return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied)); }

/** Inputs of one original operation response; `created` marks actions that create an outbound obligation and `matches` guards the original intent. */
type AdmissionVerificationResponse<Result> = { boundary: AdmissionRouteBoundary; operationId: string; outcome: AdmissionVerificationHttpOutcome; schema: z.ZodType<Result>; created?: boolean; matches?: (result: Result) => boolean };

/** @param response - Boundary, original validated client UUID, own application result (never provider payload), minimal public snapshot and optional guards. @returns Original confirmed envelope or real registered progress, without internal fields. */
function respond<Result>({ boundary, operationId, outcome, schema, created = false, matches = () => true }: AdmissionVerificationResponse<Result>): Response {
  if (!outcome.ok) return boundary.failure(outcome.failure);
  const operationSchema = createAdmissionOperationStateSchema(schema), parsed = operationSchema.safeParse(outcome.value);
  if (!parsed.success || parsed.data.operationId.toLowerCase() !== operationId.toLowerCase() || parsed.data.state === OPERATION_STATE.completed && !matches(parsed.data.result)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
  return boundary.success(operationSchema, parsed.data, operationStatus(parsed.data.state === OPERATION_STATE.started, parsed.data.state === OPERATION_STATE.completed && created && !parsed.data.replayed));
}

/** @param started - Whether only progress is registered. @param freshlyCreated - Whether this call created the outbound obligation. @returns Accepted for progress, created for a new obligation, else OK. */
function operationStatus(started: boolean, freshlyCreated: boolean) {
  if (started) return HTTP_STATUS.accepted;
  return freshlyCreated ? HTTP_STATUS.created : HTTP_STATUS.ok;
}

/** Fixed diagnostic operation of each challenge action. */
const CHALLENGE_HTTP_OPERATION = { issue: ADMISSION_HTTP_OPERATION.challengeIssue, verify: ADMISSION_HTTP_OPERATION.challengeVerify, resend: ADMISSION_HTTP_OPERATION.challengeResend } as const;

/** @param open - Native request composition accepting safe correlation only. @returns Explicit issue/verify/resend handlers with once-only input guards and fixed purpose, without arbitrary body/destination/sender. */
export function createAdmissionContactVerificationHandlers(open: (requestContext: RequestContext) => Promise<ContactVerificationServices>) {
  /** @param request - Same-origin explicit applicant mutation. @param context - Native framework route params. @param action - Statically selected application action. @returns Minimal original challenge/proof or safe failure. */
  async function execute(request: Request, context: { params: Promise<{ slug: string; challengeId?: string }> }, action: keyof Pick<ContactVerificationUseCases, "issue" | "verify" | "resend">): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: CHALLENGE_HTTP_OPERATION[action] });
    try {
      if (!hasAllowedAdmissionOrigin(request)) return denyOrigin(boundary);
      const input = await readAdmissionRouteInput(boundary, { request, params: context.params }, { params: action === "issue" ? admissionTribeParamsSchema : admissionChallengeParamsSchema, query: admissionEmptyQuerySchema });
      if ("response" in input) return input.response;
      const { params } = input;
      if (action === "issue") return await issue(boundary, params.slug);
      const challengeId = "challengeId" in params ? String(params.challengeId) : undefined;
      if (!challengeId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
      if (action === "verify") return await verify(boundary, params.slug, challengeId);
      return await resend(boundary, params.slug, challengeId);
    } catch (error) { return boundary.unexpected(error); }
  }

  /** @param boundary - Current request boundary. @param slug - Validated tribe slug. @returns Original issuance or progress, or a safe failure. */
  async function issue(boundary: AdmissionRouteBoundary, slug: string): Promise<Response> {
    const command = await readAdmissionBodyInTribeScope(boundary, admissionChallengeCreateSchema, () => open(boundary.requestContext), slug);
    if ("response" in command) return command.response;
    const { body, services, scope } = command;
    const { requestId: admissionRequestId, ...proposal } = body;
    const result = await services.verification.issue({ ...proposal, ...(admissionRequestId ? { admissionRequestId } : {}), ...scope });
    return respond({ boundary, operationId: body.operationId, outcome: result, schema: admissionChallengeSnapshotSchema, created: true, matches: (snapshot) => snapshot.channel === body.channel });
  }

  /** @param boundary - Current request boundary. @param slug - Validated tribe slug. @param challengeId - Original own challenge. @returns Admission proof or a safe verification failure. */
  async function verify(boundary: AdmissionRouteBoundary, slug: string, challengeId: string): Promise<Response> {
    const command = await readAdmissionBodyInTribeScope(boundary, admissionChallengeVerifySchema, () => open(boundary.requestContext), slug);
    if ("response" in command) return command.response;
    const { body, services, scope } = command;
    const result = await services.verification.verify({ operationId: body.operationId, verificationCode: body.verificationCode, challengeId, ...scope });
    return respond({ boundary, operationId: body.operationId, outcome: result, schema: admissionVerifiedContactSchema });
  }

  /** @param boundary - Current request boundary. @param slug - Validated tribe slug. @param challengeId - Original own challenge. @returns Replacement or original progress, or a safe failure. */
  async function resend(boundary: AdmissionRouteBoundary, slug: string, challengeId: string): Promise<Response> {
    const command = await readAdmissionBodyInTribeScope(boundary, admissionChallengeResendSchema, () => open(boundary.requestContext), slug);
    if ("response" in command) return command.response;
    const { body, services, scope } = command;
    const result = await services.verification.resend({ operationId: body.operationId, ...(body.useSmsAlternative ? { useSmsAlternative: true } : {}), challengeId, ...scope });
    return respond({ boundary, operationId: body.operationId, outcome: result, schema: admissionChallengeSnapshotSchema, created: true, matches: (snapshot) => !body.useSmsAlternative || snapshot.channel === MESSAGING_PUBLIC_CHANNEL.sms });
  }
  return {
    /** @param request - Confirmed initial channel/contact proposal. @param context - Native tribe params. @returns Original issuance or progress. */
    issue: (request: Request, context: { params: Promise<{ slug: string }> }) => execute(request, context, "issue"),
    /** @param request - Exact local code input. @param context - Original own challenge params. @returns Admission proof or safe verification failure. */
    verify: (request: Request, context: { params: Promise<{ slug: string; challengeId: string }> }) => execute(request, context, "verify"),
    /** @param request - Explicit original resend or SMS alternative. @param context - Original own challenge params. @returns Replacement or original progress. */
    resend: (request: Request, context: { params: Promise<{ slug: string; challengeId: string }> }) => execute(request, context, "resend"),
  };
}

/** @param open - DB-only native request composition. @returns Own pending proof attachment with original request/version/operation guards. */
export function createAdmissionProofAttachmentHandler(open: () => Promise<ProofApplicationServices>) {
  return async function POST(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.proofApply });
    try {
      const route = await openAdmissionTribeCommand(boundary, { request, params: context.params }, { params: proofAttachmentParamsSchema, query: admissionEmptyQuerySchema, body: admissionProofAttachmentSchema }, open);
      if ("response" in route) return route.response;
      const { body, params } = route, { tribeId, requestId } = route.scope;
      const result = await route.services.applyProof.execute({ operationId: body.operationId, expectedRequestVersion: body.expectedVersion, proofId: body.proofId, tribeId, admissionRequestId: params.requestId, requestId });
      return respond({ boundary, operationId: body.operationId, outcome: result, schema: admissionProofApplicationSnapshotSchema.options[0], matches: (snapshot) => snapshot.requestId.toLowerCase() === params.requestId.toLowerCase() && snapshot.proofId.toLowerCase() === body.proofId.toLowerCase() && snapshot.requestVersion === body.expectedVersion + 1 });
    } catch (error) { return boundary.unexpected(error); }
  };
}
