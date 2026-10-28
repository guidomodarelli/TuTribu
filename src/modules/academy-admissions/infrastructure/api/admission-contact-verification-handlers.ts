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
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import type { RequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";

/** Own application outcomes retain private failure causes until the common HTTP boundary projects them. */
export type AdmissionVerificationHttpOutcome = { ok: true; value: unknown } | { ok: false; failure: AdmissionFailure };
/** Canonical routing selects only a tribe; applicant identity remains inside the native use case. */
type AdmissionVerificationRouting = { resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> } };
/** Transport composition exists only for issuance/resend; local verification never invokes its dispatcher. */
type ContactVerificationServices = AdmissionVerificationRouting & { verification: { issue(input: IssueAdmissionContactChallengeInput): Promise<AdmissionVerificationHttpOutcome>; verify(input: VerifyAdmissionContactChallengeInput): Promise<AdmissionVerificationHttpOutcome>; resend(input: ResendAdmissionContactChallengeInput): Promise<AdmissionVerificationHttpOutcome> } };
/** Attachment has a separate DB-only composition and cannot send a message. */
type ProofApplicationServices = AdmissionVerificationRouting & { applyProof: { execute(input: ApplyAdmissionProofInput): Promise<AdmissionVerificationHttpOutcome> } };
/** The single existing boundary owns input validation, errors and safe diagnostics. */
type AdmissionVerificationBoundary = ReturnType<typeof createAdmissionRouteBoundary>;
/** Canonicalizes only this proof route's own UUID reference without changing other request entrypoint contracts. */
const proofAttachmentParamsSchema = admissionRequestParamsSchema.transform((params) => ({ ...params, requestId: params.requestId.toLowerCase() }));

/** @param boundary - Current native own JSON boundary. @returns A safe denial for caller origin before composition. */
function denyOrigin(boundary: AdmissionVerificationBoundary): Response { return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied)); }

/** Inputs of one original operation response; `created` marks actions that create an outbound obligation and `matches` guards the original intent. */
type AdmissionVerificationResponse<Result> = { boundary: AdmissionVerificationBoundary; operationId: string; outcome: AdmissionVerificationHttpOutcome; schema: z.ZodType<Result>; created?: boolean; matches?: (result: Result) => boolean };

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
      const params = boundary.input("params", action === "issue" ? admissionTribeParamsSchema : admissionChallengeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      if (action === "issue") return await issue(boundary, params.value.slug);
      const challengeId = "challengeId" in params.value ? String(params.value.challengeId) : undefined;
      if (!challengeId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
      if (action === "verify") return await verify(boundary, params.value.slug, challengeId);
      return await resend(boundary, params.value.slug, challengeId);
    } catch (error) { return boundary.unexpected(error); }
  }

  /** @param boundary - Current request boundary. @param slug - Validated tribe slug. @returns Original issuance or progress, or a safe failure. */
  async function issue(boundary: AdmissionVerificationBoundary, slug: string): Promise<Response> {
    const body = await boundary.readBody(admissionChallengeCreateSchema);
    if (!body.usable) return body.response;
    const services = await open(boundary.requestContext), requestId = boundary.requestContext.requestId;
    const identity = await services.resolveTribe.execute({ slug, requestId });
    if (!identity.ok) return boundary.failure(identity.failure);
    const { requestId: admissionRequestId, ...proposal } = body.value;
    const result = await services.verification.issue({ ...proposal, ...(admissionRequestId ? { admissionRequestId } : {}), tribeId: identity.value.tribeId, requestId });
    return respond({ boundary, operationId: body.value.operationId, outcome: result, schema: admissionChallengeSnapshotSchema, created: true, matches: (snapshot) => snapshot.channel === body.value.channel });
  }

  /** @param boundary - Current request boundary. @param slug - Validated tribe slug. @param challengeId - Original own challenge. @returns Admission proof or a safe verification failure. */
  async function verify(boundary: AdmissionVerificationBoundary, slug: string, challengeId: string): Promise<Response> {
    const body = await boundary.readBody(admissionChallengeVerifySchema);
    if (!body.usable) return body.response;
    const services = await open(boundary.requestContext), requestId = boundary.requestContext.requestId;
    const identity = await services.resolveTribe.execute({ slug, requestId });
    if (!identity.ok) return boundary.failure(identity.failure);
    const result = await services.verification.verify({ operationId: body.value.operationId, verificationCode: body.value.verificationCode, challengeId, tribeId: identity.value.tribeId, requestId });
    return respond({ boundary, operationId: body.value.operationId, outcome: result, schema: admissionVerifiedContactSchema });
  }

  /** @param boundary - Current request boundary. @param slug - Validated tribe slug. @param challengeId - Original own challenge. @returns Replacement or original progress, or a safe failure. */
  async function resend(boundary: AdmissionVerificationBoundary, slug: string, challengeId: string): Promise<Response> {
    const body = await boundary.readBody(admissionChallengeResendSchema);
    if (!body.usable) return body.response;
    const services = await open(boundary.requestContext), requestId = boundary.requestContext.requestId;
    const identity = await services.resolveTribe.execute({ slug, requestId });
    if (!identity.ok) return boundary.failure(identity.failure);
    const result = await services.verification.resend({ operationId: body.value.operationId, ...(body.value.useSmsAlternative ? { useSmsAlternative: true } : {}), challengeId, tribeId: identity.value.tribeId, requestId });
    return respond({ boundary, operationId: body.value.operationId, outcome: result, schema: admissionChallengeSnapshotSchema, created: true, matches: (snapshot) => !body.value.useSmsAlternative || snapshot.channel === MESSAGING_PUBLIC_CHANNEL.sms });
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
      if (!hasAllowedAdmissionOrigin(request)) return denyOrigin(boundary);
      const params = boundary.input("params", proofAttachmentParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const body = await boundary.readBody(admissionProofAttachmentSchema);
      if (!body.usable) return body.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!identity.ok) return boundary.failure(identity.failure);
      const result = await services.applyProof.execute({ operationId: body.value.operationId, expectedRequestVersion: body.value.expectedVersion, proofId: body.value.proofId, tribeId: identity.value.tribeId, admissionRequestId: params.value.requestId, requestId });
      return respond({ boundary, operationId: body.value.operationId, outcome: result, schema: admissionProofApplicationSnapshotSchema.options[0], matches: (snapshot) => snapshot.requestId.toLowerCase() === params.value.requestId.toLowerCase() && snapshot.proofId.toLowerCase() === body.value.proofId.toLowerCase() && snapshot.requestVersion === body.value.expectedVersion + 1 });
    } catch (error) { return boundary.unexpected(error); }
  };
}
