/** Owns membership input, public error and original-result contracts at the HTTP boundary. @module tribe-membership-lifecycle-http-constants */
import { z } from "zod";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { TRIBE_SLUG_PATTERN } from "../domain/value-objects/tribe-slug";
import { tribeMembershipLifecycleResultSchema } from "../application/results/tribe-membership-lifecycle-result";
import { TRIBE_MEMBERSHIP_STATUS } from "./tribe-page-access";
import { TRIBE_MEMBERSHIP_LIFECYCLE_ACTIONS } from "./tribe-membership-lifecycle";
import type { TribeMembershipLifecycleErrorCode } from "../domain/errors/tribe-membership-lifecycle-error";

/** Uses explicit failure codes rather than deriving types from a runtime object. */
export const TRIBE_MEMBERSHIP_LIFECYCLE_ERROR_CODES = ["authentication_required", "permission_denied", "invalid_input", "resource_unavailable", "membership_conflict", "idempotency_conflict", "operation_unresolved", "public_contract_unusable", "unexpected_failure"] as const satisfies readonly TribeMembershipLifecycleErrorCode[];
/** Validates only public URL scope, never provider responses or stored rows. */
export const tribeMembershipLifecycleParamsSchema = z.strictObject({ slug: z.string().regex(TRIBE_SLUG_PATTERN) });
/** Recovery carries the original intent in its body, keeping private identifiers out of URL queries. */
export const tribeMembershipLifecycleInputSchema = z.strictObject({ operationId: z.uuid().transform((operationId) => operationId.toLowerCase()), memberId: z.uuid().transform((memberId) => memberId.toLowerCase()), action: z.enum(TRIBE_MEMBERSHIP_LIFECYCLE_ACTIONS), expectedStatus: z.enum([TRIBE_MEMBERSHIP_STATUS.active, TRIBE_MEMBERSHIP_STATUS.muted, TRIBE_MEMBERSHIP_STATUS.blocked, TRIBE_MEMBERSHIP_STATUS.removed]), confirmed: z.literal(true) });
/** Empty query prevents an alternate input channel for permissions or source flags. */
export const tribeMembershipLifecycleQuerySchema = z.strictObject({});
/** Copies only safe errors and independently bound durable original progress. */
export const tribeMembershipLifecycleErrorSchema = z.strictObject({ code: z.enum(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR_CODES), message: z.string().min(1), requestId: z.string().min(1), operationId: z.uuid().optional() });
/** Own original operation result contains no account, session, note or private request. */
export const tribeMembershipLifecycleOperationSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal(OPERATION_STATE.started), operationId: z.uuid() }), z.strictObject({ state: z.literal(OPERATION_STATE.completed), operationId: z.uuid(), replayed: z.boolean(), result: tribeMembershipLifecycleResultSchema })]);
/** Null means the original is unknown; observing it never starts the mutation. */
export const tribeMembershipLifecycleRecoverySchema = z.strictObject({ original: tribeMembershipLifecycleOperationSchema.nullable() });
/** User-visible copy remains safe and Spanish; internal causes never determine a message. */
export const TRIBE_MEMBERSHIP_LIFECYCLE_MESSAGES: Record<TribeMembershipLifecycleErrorCode, string> = {
  authentication_required: "Iniciá sesión nuevamente para gestionar tu membresía.", permission_denied: "Tu cuenta no puede realizar este cambio de membresía.", invalid_input: "Revisá los datos y confirmá el cambio de membresía.", resource_unavailable: "Esta membresía ya no está disponible.", membership_conflict: "La membresía cambió. Revisá su estado antes de continuar.", idempotency_conflict: "Este envío corresponde a otro cambio. Consultá el resultado original.", operation_unresolved: "Todavía no pudimos confirmar el resultado. Consultá el envío original antes de repetirlo.", public_contract_unusable: "No pudimos confirmar la respuesta del cambio. Consultá el envío original.", unexpected_failure: "No pudimos confirmar el cambio de membresía. Consultá el envío original.",
};
/** Fixed transport status follows each membership-owned semantic failure. */
export const TRIBE_MEMBERSHIP_LIFECYCLE_HTTP_STATUS: Record<TribeMembershipLifecycleErrorCode, number> = {
  authentication_required: HTTP_STATUS.unauthorized, permission_denied: HTTP_STATUS.forbidden, invalid_input: HTTP_STATUS.badRequest, resource_unavailable: HTTP_STATUS.notFound, membership_conflict: HTTP_STATUS.conflict, idempotency_conflict: HTTP_STATUS.conflict, operation_unresolved: HTTP_STATUS.accepted, public_contract_unusable: HTTP_STATUS.serverError, unexpected_failure: HTTP_STATUS.serverError,
};
/** Fixed diagnostic names distinguish an explicit change from read-only recovery. */
export const TRIBE_MEMBERSHIP_LIFECYCLE_HTTP_OPERATION = { change: "change_tribe_membership", recover: "recover_tribe_membership" } as const;
/** Scopes structured diagnostics to the owning feature. */
export const TRIBE_MEMBERSHIP_LIFECYCLE_HTTP_FEATURE = "tribe-membership";
