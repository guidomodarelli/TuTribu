/** Groups existing base-binding statements while retaining native caller privileges. */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionContact } from "../../domain/value-objects/admission-contact";
import type { AdmissionRequest } from "../../domain/entities/admission-request";
import { ADMISSION_CONTACT_BINDING_LOCK_DOMAIN } from "../../constants/admission-proof";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** Native metadata after the original contact lock; no key material is returned. */
export type BaseAdmissionBindingScope = {
  binding_id: string | null;
  binding_owner_user_id: string | null;
  has_minimized_bindings: boolean;
};

/**
 * Reads fresh reservation metadata after advisory and binding-row waits.
 * @param database - Original authorized submission transaction.
 * @param tribeId - Fixed server-selected academy.
 * @param contact - Canonical contact from its own current submission.
 * @returns Locked binding and the subsequent minimized-binding observation.
 */
export async function prepareBaseAdmissionBinding(database: RequestDatabase, tribeId: string, contact: AdmissionContact): Promise<BaseAdmissionBindingScope> {
  const lockScope = JSON.stringify([ADMISSION_CONTACT_BINDING_LOCK_DOMAIN, tribeId, contact.type, contact.value]);
  const row = (await database.execute<BaseAdmissionBindingScope>(sql`select * from public.prepare_base_admission_contact_binding(${tribeId},${contact.type},${contact.value},${lockScope})`)).rows[0];
  if (!row) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  return row;
}

/**
 * Stages the binding and request provenance in their original statement order.
 * @param database - Same transaction holding its contact and request fences.
 * @param request - Current own pending proposal and expected version.
 * @param contact - Canonical contact already validated by the binding owner.
 * @param evidenceId - Current locked global identity capture.
 * @param fingerprint - Verified external contact-key digest and key identifier.
 * @param bindingId - Existing locked binding, or null to insert one.
 * @returns Whether the request CAS succeeded; its owner rolls back on false.
 */
export async function writeBaseAdmissionBinding(database: RequestDatabase, request: AdmissionRequest, contact: AdmissionContact, evidenceId: string, fingerprint: { digest: Uint8Array; keyId: string }, bindingId: string | null): Promise<boolean> {
  return Boolean((await database.execute(sql`select request_id from public.write_base_admission_contact_binding(${request.tribeId},${request.userId},${request.id},${request.version},${contact.type},${contact.value},${evidenceId},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${bindingId})`)).rows[0]);
}
