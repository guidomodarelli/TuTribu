/** Keeps historical direct entry closed after cutover and routes explicit requests through admission. @module academy-join-handler */
import "server-only";
import { z } from "zod";
import type { RequestAcademyAdmissionCommand } from "@/src/modules/tribes/domain/repositories/academy-admission-entry";
import type { TribeAcademyAdmissionStatus } from "@/src/modules/tribes/domain/repositories/tribe-academy-admission-repository";
import type { AcademyPublicOffer } from "@/src/modules/product-access/domain/repositories/product-access-repository";
import type { AdmissionMutationServices } from "./admission-mutation-handlers";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema, admissionSubmissionSchema } from "./admission-request-schemas";
import { ADMISSION_ERROR_HTTP_STATUS } from "./admission-error-status";
import { readAdmissionCommandInput } from "./admission-route-steps";
import { respondToAdmissionSubmission } from "./admission-submission-response";
import { admissionFailure, type AdmissionFailure, type AdmissionPublicError } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { ADMISSION_HTTP_OPERATION } from "@/src/modules/academy-admissions/constants/admission-http";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_DIAGNOSTIC_FEATURE } from "@/src/modules/academy-admissions/constants/admission-diagnostics";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { legacyAcademyJoinSchema } from "@/src/modules/academy-admissions/application/results/academy-entry-result";
import { createOwnJsonRouteBoundary, projectOwnPublicFailure } from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";

/** An empty historical body does not authorize a new admission request. */
const joinBodySchema = z.union([
  admissionSubmissionSchema.transform((intent) => ({ explicit: true as const, intent })),
  z.strictObject({}).transform(() => ({ explicit: false as const })),
]);
const legacyResponse = {
  admission_closed: { message: ACADEMY_ROUTE_COPY.admissionClosed, status: HTTP_STATUS.forbidden },
  already_member: { message: ACADEMY_ROUTE_COPY.alreadyMember, status: HTTP_STATUS.ok },
  blocked: { message: ACADEMY_ROUTE_COPY.blocked, status: HTTP_STATUS.forbidden },
  joined: { message: ACADEMY_ROUTE_COPY.joined, status: HTTP_STATUS.created },
} as const;

/**
 * Failures of the historical free entry. They carry academy copy: that entry
 * has no form, ledger operation or state to consult, and it is idempotent.
 */
type LegacyJoinFailureCode = "join_unavailable" | "request_required";
type LegacyJoinFailure = { code: LegacyJoinFailureCode; cause?: unknown };
type LegacyJoinPublicError = { code: LegacyJoinFailureCode; message: string; requestId: string };

const LEGACY_JOIN_FAILURE_CODE = {
  /** The entry failed for an unexpected reason; retrying is safe. */
  joinUnavailable: "join_unavailable",
  /** The tribe activated admission control: entry now needs an admission request. */
  requestRequired: "request_required",
} as const satisfies Record<string, LegacyJoinFailureCode>;

const LEGACY_JOIN_FAILURE_COPY = {
  status: { join_unavailable: HTTP_STATUS.serverError, request_required: HTTP_STATUS.conflict },
  message: { join_unavailable: ACADEMY_ROUTE_COPY.joinUnavailable, request_required: ACADEMY_ROUTE_COPY.requestRequired },
} as const satisfies { status: Record<LegacyJoinFailureCode, number>; message: Record<LegacyJoinFailureCode, string> };

const LEGACY_JOIN_FAILURE_CODES: ReadonlySet<string> = new Set(Object.values(LEGACY_JOIN_FAILURE_CODE));

const legacyJoinPublicErrorSchema = z.strictObject({
  code: z.enum([LEGACY_JOIN_FAILURE_CODE.joinUnavailable, LEGACY_JOIN_FAILURE_CODE.requestRequired]),
  message: z.string(),
  requestId: z.string().min(1),
}).refine((error) => error.message === LEGACY_JOIN_FAILURE_COPY.message[error.code]) satisfies z.ZodType<LegacyJoinPublicError>;

/** Composition binds both paths to the current native actor, never a body role/account. */
export type AcademyJoinServices = {
  getViewer(): Promise<{ id: string } | null>;
  offer(query: { tribeSlug: string }): Promise<AcademyPublicOffer | null>;
  joinEntry(command: RequestAcademyAdmissionCommand): ReturnType<AdmissionMutationServices["submit"]["execute"]>;
  joinLegacy(command: { tribeSlug: string }): Promise<{ status: TribeAcademyAdmissionStatus }>;
};

/** @param failure - Own failure of this route. @returns Whether it belongs to the historical entry. */
function isLegacyJoinFailure(failure: AdmissionFailure | LegacyJoinFailure): failure is LegacyJoinFailure {
  return LEGACY_JOIN_FAILURE_CODES.has(failure.code);
}

/**
 * Builds the route boundary: admission failures keep the admission catalog,
 * historical entry failures answer with academy copy. Both log the cause chain.
 * @param request - Native request.
 * @returns Guarded input/output and error response helpers.
 */
function createAcademyJoinRouteBoundary(request: Request) {
  return createOwnJsonRouteBoundary<AdmissionFailure | LegacyJoinFailure, AdmissionPublicError | LegacyJoinPublicError>({
    request, operation: ADMISSION_HTTP_OPERATION.legacyJoin, feature: ADMISSION_DIAGNOSTIC_FEATURE,
    errorSchema: z.union([admissionPublicErrorSchema, legacyJoinPublicErrorSchema]),
    invalidInput: () => admissionFailure(ADMISSION_ERROR_CODE.invalidInput),
    unusableContract: () => admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable),
    unexpectedFailure: (cause) => admissionFailure(ADMISSION_ERROR_CODE.unexpectedFailure, { cause }),
    projectFailure: (failure, requestId) => isLegacyJoinFailure(failure)
      ? projectOwnPublicFailure(failure, requestId, LEGACY_JOIN_FAILURE_COPY)
      : projectOwnPublicFailure(failure, requestId, { status: ADMISSION_ERROR_HTTP_STATUS, message: ADMISSION_ERROR_MESSAGE }),
  });
}

type AcademyJoinRouteBoundary = ReturnType<typeof createAcademyJoinRouteBoundary>;

/**
 * Runs the historical free entry of an unprotected academy. An admission
 * activation that commits while the page was open (or during the entry) is
 * answered as `request_required`, never as an input error or closed admissions;
 * any other failure keeps its cause and answers with retry copy.
 * @param input - Request boundary, native composition and validated tribe slug.
 * @returns The historical outcome or its academy failure.
 */
async function joinHistorically({ boundary, open, request, slug }: { boundary: AcademyJoinRouteBoundary; open: () => Promise<AcademyJoinServices>; request: Request; slug: string }): Promise<Response> {
  const requestRequired = () => boundary.failure({ code: LEGACY_JOIN_FAILURE_CODE.requestRequired });
  let services: AcademyJoinServices | null = null;
  let result: { status: TribeAcademyAdmissionStatus };
  try {
    services = await open();
    if (!await services.getViewer()) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.authenticationRequired));
    if ((await services.offer({ tribeSlug: slug }))?.admissionRequiresRequest) return requestRequired();
    result = await services.joinLegacy({ tribeSlug: slug });
    // Closed by a selector that already sees an activation committed after the offer read.
    if (result.status === "admission_closed" && (await services.offer({ tribeSlug: slug }))?.admissionRequiresRequest) return requestRequired();
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason;
    // The membership guard refuses an entry that a concurrent activation protected.
    const isProtectedNow = services ? await services.offer({ tribeSlug: slug }).then((offer) => offer?.admissionRequiresRequest === true, () => false) : false;
    return isProtectedNow ? requestRequired() : boundary.failure({ code: LEGACY_JOIN_FAILURE_CODE.joinUnavailable, cause: error });
  }
  const response = legacyResponse[result.status];
  return boundary.success(legacyAcademyJoinSchema, { status: result.status, message: response.message }, response.status);
}

/** @param open - Native server-selected application wiring. @returns One validated historical/explicit admission handler with no fictitious membership. */
export function createAcademyJoinHandler(open: () => Promise<AcademyJoinServices>) {
  return async (request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> => {
    const boundary = createAcademyJoinRouteBoundary(request);
    try {
      const input = await readAdmissionCommandInput(boundary, { request, params: context.params }, { params: admissionTribeParamsSchema, query: admissionEmptyQuerySchema, body: joinBodySchema, emptyBody: { emptyBodyValue: {} } });
      if ("response" in input) return input.response;
      const { body, params: { slug } } = input;
      if (!body.explicit) return await joinHistorically({ boundary, open, request, slug });
      const services = await open();
      if (!await services.getViewer()) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.authenticationRequired));
      const result = await services.joinEntry({ ...body.intent, tribeSlug: slug, requestId: boundary.requestContext.requestId });
      return respondToAdmissionSubmission(boundary, slug, body.intent.operationId, result);
    } catch (error) { return boundary.unexpected(error); }
  };
}
