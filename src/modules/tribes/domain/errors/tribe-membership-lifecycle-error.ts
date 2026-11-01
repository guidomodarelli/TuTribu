/** Keeps membership failures typed and their original diagnostic cause server-side. @module tribe-membership-lifecycle-error */

/** Closed semantic codes are explicit rather than derived from runtime constants. */
export type TribeMembershipLifecycleErrorCode = "authentication_required" | "permission_denied" | "invalid_input" | "resource_unavailable" | "membership_conflict" | "idempotency_conflict" | "operation_unresolved" | "public_contract_unusable" | "unexpected_failure" | "platform_security_unavailable";

/** Preserves an original operation reference only when its owner has durable evidence. */
export class TribeMembershipLifecycleError extends Error {
  /** Original public operation reference, independent of private cause metadata. */
  readonly operationId: string | undefined;
  /** @param code - Safe semantic failure. @param options - Private original cause and optional durable original operation. */
  constructor(readonly code: TribeMembershipLifecycleErrorCode, options: { cause?: unknown; operationId?: string } = {}) {
    super(`TribeMembership.change failed: ${code}`, { cause: options.cause });
    this.name = "TribeMembershipLifecycleError";
    this.operationId = options.operationId;
  }
}
