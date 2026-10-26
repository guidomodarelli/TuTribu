/** Binds a current trusted base identity only with its new owned presentation. @module postgres-base-admission-binding */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { AdmissionRequest } from "../../domain/entities/admission-request";
import type { AutomaticAdmissionFacts } from "../../domain/entities/automatic-admission-decision";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { createAdmissionContactFingerprint } from "../verification/admission-contact-fingerprint";
import { assertMinimizedAdmissionContactAvailable } from "./assert-unreserved-admission-contact";
import { assertAdmissionContactKeyMaterial } from "./assert-admission-contact-key-material";
import { prepareBaseAdmissionBinding, writeBaseAdmissionBinding } from "./postgres-base-admission-binding-storage";

/** @param database - Original protected transaction. @param scope - Native submitting account. @param request - Exact new pending proposal already inserted. @param facts - Locked current native base capture, not browser evidence. @param security - Live private local fingerprint context. @returns After immutable binding and request provenance are staged together; no membership or list edit occurs. */
export async function bindBaseAdmissionContact(database: RequestDatabase, scope: AdmissionCommandScope, request: AdmissionRequest, facts: AutomaticAdmissionFacts, security: MessagingSecurityConfig): Promise<void> {
  const contact = request.contact, capture = facts.baseEvidence;
  if (!contact || !capture || capture.userId !== scope.userId || request.userId !== scope.userId || request.tribeId !== scope.tribeId || capture.invalidated || capture.normalizedEmail !== contact.value) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.contactEvidenceRequired);
  const binding = await prepareBaseAdmissionBinding(database, scope.tribeId, contact);
  // A concurrent account deletion may minimize the row while this lock waits.
  if (binding.has_minimized_bindings) await assertMinimizedAdmissionContactAvailable(database, scope.tribeId, contact, async () => security);
  if (binding.binding_id && binding.binding_owner_user_id !== scope.userId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.contactBindingConflict);
  await assertAdmissionContactKeyMaterial(database, security);
  const fingerprint = await createAdmissionContactFingerprint(contact, security);
  const updated = await writeBaseAdmissionBinding(database, request, contact, capture.id, fingerprint, binding.binding_id);
  if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
}
