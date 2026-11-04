/** Keeps safe lifecycle errors separate from private causes and durable original outcomes. @module tribe-lifecycle-error */
export type TribeLifecycleErrorCode = "authentication_required" | "permission_denied" | "reauthentication_required" | "invalid_input" | "resource_unavailable" | "lifecycle_conflict" | "idempotency_conflict" | "operation_unresolved" | "public_contract_unusable" | "unexpected_failure" | "platform_security_unavailable";

/** Exposes an original reference only after the writer has evidence that its commit outcome remains unknown. */
export class TribeLifecycleError extends Error {
  readonly operationId: string | undefined;
  /** @param code - Safe machine failure. @param options - Private cause and optional original public operation reference. */
  constructor(readonly code: TribeLifecycleErrorCode, options: { cause?: unknown; operationId?: string } = {}) {
    super(`TribeLifecycle.change failed: ${code}`, { cause: options.cause });
    this.name = "TribeLifecycleError"; this.operationId = options.operationId;
  }
}
