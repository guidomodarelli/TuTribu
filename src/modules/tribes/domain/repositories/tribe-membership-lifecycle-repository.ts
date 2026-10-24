/** Defines the membership owner's atomic command contract independently of HTTP and storage. @module tribe-membership-lifecycle-repository */
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";

/** Technical command names never imply an actor, role or paid source supplied by the browser. */
export type TribeMembershipLifecycleAction = "leave" | "remove" | "block";
/** Fixes the real session and tribe before entering the authoritative writer. */
export type TribeMembershipLifecycleContext = { tribeId: string; actorUserId: string; sessionId: string; requestId: string };
/** A member instance and its current state prevent stale actions from targeting another membership. */
export type TribeMembershipLifecycleInput = {
  operationId: string; action: TribeMembershipLifecycleAction; memberId: string;
  expectedStatus: "active" | "muted" | "blocked" | "removed"; confirmed: boolean;
};
/** Returns only the resulting membership state and the original instance identity. */
export type TribeMembershipLifecycleResult =
  | { outcome: "changed"; memberId: string; action: TribeMembershipLifecycleAction; status: "blocked" | "removed"; deleted: boolean }
  | { outcome: "denied"; code: "permission_denied" | "resource_unavailable" | "membership_conflict" };
/** Owns session/leader/self checks, current-state CAS, provenance revocation and original replay. */
export interface TribeMembershipLifecycleWriter {
  /** @param context - Actual native actor and tenant. @param input - Original explicitly confirmed command. @returns One durable mutation result, or work whose original outcome is still unresolved. */
  change(context: TribeMembershipLifecycleContext, input: TribeMembershipLifecycleInput): Promise<AdmissionOperationResult<TribeMembershipLifecycleResult>>;
  /** @param context - Actual native actor and tenant. @param input - Exact original intent. @returns The known original without claiming or repeating its mutation. */
  recover(context: TribeMembershipLifecycleContext, input: TribeMembershipLifecycleInput): Promise<AdmissionOperationResult<TribeMembershipLifecycleResult> | null>;
}
