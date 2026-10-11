/** Defines original tribe lifecycle commands without framework, provider or database details. @module tribe-lifecycle-repository */
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";

export type TribeLifecycleAction = "exit_academy" | "delete_tribe";
/** Server identity fixes actor/session; archived UUID scope is independent of a reused slug. */
export type TribeLifecycleContext = { tribeId: string; actorUserId: string; sessionId: string; requestId: string };
/** A CAS version and explicit confirmation describe the original command without granting authority. */
export type TribeLifecycleInput = { operationId: string; action: TribeLifecycleAction; expectedConfigVersion: number; confirmed: boolean };
/** Deleted scope results contain no retired contact, internal audit, credential or member data. */
export type TribeLifecycleResult = { action: TribeLifecycleAction; deleted: boolean; accessModel: "legacy" | null; configVersion: number | null };
/** Commits current-authority lifecycle effects and their durable result together, surviving physical deletion. */
export interface TribeLifecycleWriter {
  change(context: TribeLifecycleContext, input: TribeLifecycleInput): Promise<AdmissionOperationResult<TribeLifecycleResult>>;
  recover(context: TribeLifecycleContext, input: TribeLifecycleInput): Promise<AdmissionOperationResult<TribeLifecycleResult> | null>;
}
