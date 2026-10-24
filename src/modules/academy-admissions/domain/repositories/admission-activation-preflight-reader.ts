/** Owns authoritative cutover preparation independently of a browser confirmation or connection diagnostic. @module admission-activation-preflight-reader */
import type { AdmissionActivationInventory } from "../policies/admission-activation-preflight";
import type { AuthorizedAdmissionContext } from "./admission-authorization-reader";

/** Runtime owners must prove complete coverage; metadata presence alone never proves application readiness. */
export interface AdmissionActivationRuntimeReader {
  /** @param tribeId - Current authorized tenant. @returns Current full evaluator/ingress readiness, without an optimistic default or external RPC. */
  isPrepared(tribeId: string): Promise<boolean>;
}
export interface AdmissionActivationInventoryReader {
  /** @param context - Current native leader scope. @returns Current private inventory; it contains only aggregate history, not account identifiers. */
  read(context: AuthorizedAdmissionContext): Promise<AdmissionActivationInventory>;
}
/** Cutover result plus the locked tenant facts the inventory read for it, so a preparation does not read them again. */
export type AdmissionActivationPreparation = { prepared: boolean; isAcademy: boolean; evaluatorEnabled: boolean; controlActivated: boolean };
export interface AdmissionActivationPreflightReader {
  /** @param tribeId - Current authorized tenant whose schema/legacy/source facts remain locked. @returns Whether this tribe's actual cutover inventory is complete, with the academy settings and protection marker it read. */
  readPreparation(tribeId: string): Promise<AdmissionActivationPreparation>;
}
