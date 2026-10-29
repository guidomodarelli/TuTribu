/** Owns confirmed lifecycle HTTP input and safe original result contracts. @module tribe-lifecycle-http-constants */
import { z } from "zod";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { TRIBE_LIFECYCLE_ACTIONS } from "./tribe-lifecycle";
import { tribeLifecycleResultSchema } from "./tribe-lifecycle-result";
import type { TribeLifecycleErrorCode } from "../domain/errors/tribe-lifecycle-error";

/** A fixed UUID remains valid routing identity after deleting its slug or reusing that slug. */
export const tribeLifecycleParamsSchema = z.strictObject({ tribeId: z.uuid().transform((tribeId) => tribeId.toLowerCase()) });
/** The browser supplies an original intent; actor, role, authentication timestamps and credentials are excluded. */
export const tribeLifecycleInputSchema = z.strictObject({ operationId: z.uuid().transform((operationId) => operationId.toLowerCase()), action: z.enum(TRIBE_LIFECYCLE_ACTIONS), expectedConfigVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), confirmed: z.literal(true) });
export const tribeLifecycleEmptyQuerySchema = z.strictObject({});
/** Explicit codes are independent of runtime maps. */
const TRIBE_LIFECYCLE_ERROR_CODES = ["authentication_required", "permission_denied", "reauthentication_required", "invalid_input", "resource_unavailable", "lifecycle_conflict", "idempotency_conflict", "operation_unresolved", "public_contract_unusable", "unexpected_failure"] as const satisfies readonly TribeLifecycleErrorCode[];
export const tribeLifecyclePublicErrorSchema = z.strictObject({ code: z.enum(TRIBE_LIFECYCLE_ERROR_CODES), message: z.string().min(1), requestId: z.string().min(1), operationId: z.uuid().optional() });
export const tribeLifecycleOriginalSchema = z.strictObject({ state: z.literal(OPERATION_STATE.completed), operationId: z.uuid(), replayed: z.boolean(), result: tribeLifecycleResultSchema });
export const tribeLifecycleRecoverySchema = z.strictObject({ original: tribeLifecycleOriginalSchema.nullable() });
/** No provider payload, retired data or SQL details determine visible copy. */
export const TRIBE_LIFECYCLE_MESSAGE: Record<TribeLifecycleErrorCode, string> = {
  authentication_required: "Iniciá sesión nuevamente para gestionar esta tribu.", permission_denied: "Sólo el líder activo puede realizar este cambio.", reauthentication_required: "Tu sesión cambió. Recargá la página e intentá de nuevo.", invalid_input: "Revisá los datos y confirmá el cambio de la tribu.", resource_unavailable: "Esta tribu ya no está disponible.", lifecycle_conflict: "La configuración cambió. Revisá el estado actual antes de continuar.", idempotency_conflict: "Este envío corresponde a otro cambio. Consultá el resultado original.", operation_unresolved: "Todavía no pudimos confirmar el resultado. Consultá el envío original antes de repetirlo.", public_contract_unusable: "No pudimos confirmar la respuesta. Consultá el envío original.", unexpected_failure: "No pudimos confirmar el cambio de la tribu. Consultá el envío original.",
};
export const TRIBE_LIFECYCLE_HTTP_STATUS: Record<TribeLifecycleErrorCode, number> = {
  authentication_required: HTTP_STATUS.unauthorized, permission_denied: HTTP_STATUS.forbidden, reauthentication_required: HTTP_STATUS.forbidden, invalid_input: HTTP_STATUS.badRequest, resource_unavailable: HTTP_STATUS.notFound, lifecycle_conflict: HTTP_STATUS.conflict, idempotency_conflict: HTTP_STATUS.conflict, operation_unresolved: HTTP_STATUS.accepted, public_contract_unusable: HTTP_STATUS.serverError, unexpected_failure: HTTP_STATUS.serverError,
};
export const TRIBE_LIFECYCLE_HTTP_OPERATION = { change: "change_tribe_lifecycle", recover: "recover_tribe_lifecycle" } as const;
export const TRIBE_LIFECYCLE_HTTP_FEATURE = "tribe-lifecycle";
