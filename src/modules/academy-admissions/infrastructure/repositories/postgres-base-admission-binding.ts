/** Binds a current trusted base identity only with its new owned presentation. @module postgres-base-admission-binding */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { AdmissionRequest } from "../../domain/entities/admission-request";
import type { AutomaticAdmissionFacts } from "../../domain/entities/automatic-admission-decision";
import { ADMISSION_CONTACT_BINDING_LOCK_DOMAIN } from "../../constants/admission-proof";
import { ADMISSION_EVIDENCE_KIND } from "../../constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { createAdmissionContactFingerprint } from "../verification/admission-contact-fingerprint";

/** @param database - Original protected transaction. @param scope - Native submitting account. @param request - Exact new pending proposal already inserted. @param facts - Locked current native base capture, not browser evidence. @param security - Live private local fingerprint context. @returns After immutable binding and request provenance are staged together; no membership or list edit occurs. */
export async function bindBaseAdmissionContact(database: RequestDatabase, scope: AdmissionCommandScope, request: AdmissionRequest, facts: AutomaticAdmissionFacts, security: MessagingSecurityConfig): Promise<void> {
  const contact = request.contact, capture = facts.baseEvidence;
  if (!contact || !capture || capture.userId !== scope.userId || request.userId !== scope.userId || request.tribeId !== scope.tribeId || capture.invalidated || capture.normalizedEmail !== contact.value) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.contactEvidenceRequired);
  await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([ADMISSION_CONTACT_BINDING_LOCK_DOMAIN, scope.tribeId, contact.type, contact.value])},0))`);
  let binding = (await database.execute<{ id: string; owner_user_id: string }>(sql`select id,owner_user_id from public.academy_admission_contact_bindings where tribe_id=${scope.tribeId} and contact_type=${contact.type} and normalized_contact=${contact.value} for update`)).rows[0];
  if (binding && binding.owner_user_id !== scope.userId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.contactBindingConflict);
  const fingerprint = await createAdmissionContactFingerprint(contact, security);
  if (!binding) binding = (await database.execute<{ id: string; owner_user_id: string }>(sql`insert into public.academy_admission_contact_bindings(tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source) values (${scope.tribeId},${contact.type},${contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${scope.userId},${request.id},${ADMISSION_EVIDENCE_KIND.base}) returning id,owner_user_id`)).rows[0];
  const updated = (await database.execute(sql`update public.academy_admission_requests set evidence_source=${ADMISSION_EVIDENCE_KIND.base},global_identity_evidence_id=${capture.id},binding_id=${binding.id},contact_fingerprint=${Buffer.from(fingerprint.digest)},fingerprint_key_id=${fingerprint.keyId},version=version+1 where id=${request.id} and tribe_id=${scope.tribeId} and user_id=${scope.userId} and status=${ADMISSION_REQUEST_STATUS.pending} and version=${request.version} and expires_at>clock_timestamp() returning id`)).rows[0];
  if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
}
