/** Protects minimized contact reservations without recovering their original identity. @module assert-unreserved-admission-contact */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { AdmissionContact } from "../../domain/value-objects/admission-contact";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { createAdmissionContactFingerprint } from "../verification/admission-contact-fingerprint";

/** @param database - Transaction already authorized for the actual actor and tribe. @param tribeId - Fixed native scope. @param contact - Canonical contact proposed by that account. @param readSecurity - Live independent keyring, read only when a minimized reservation exists. @returns Nothing while the contact is not reserved; unknown retained keys close safely. */
export async function assertUnreservedAdmissionContact(database: RequestDatabase, tribeId: string, contact: AdmissionContact, readSecurity: () => Promise<MessagingSecurityConfig>): Promise<void> {
  const exists = (await database.execute(sql`select id from public.academy_admission_contact_bindings where tribe_id=${tribeId} and contact_type=${contact.type} and normalized_contact is null limit 1`)).rows[0];
  if (!exists) return;
  const security = await readSecurity(), ring = security.keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint], keyIds = [...ring.keys.keys()];
  if (!keyIds.length) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  const availableKeys = keyIds.map((keyId) => sql`${keyId}`);
  const unavailable = (await database.execute(sql`select id from public.academy_admission_contact_bindings where tribe_id=${tribeId} and contact_type=${contact.type} and normalized_contact is null and fingerprint_key_id not in (${sql.join(availableKeys, sql`, `)}) limit 1`)).rows[0];
  if (unavailable) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  const fingerprints = await Promise.all(keyIds.map((keyId) => createAdmissionContactFingerprint(contact, security, keyId)));
  const matches = fingerprints.map((fingerprint) => sql`(fingerprint_key_id=${fingerprint.keyId} and contact_fingerprint=${Buffer.from(fingerprint.digest)})`);
  const reserved = (await database.execute(sql`select id from public.academy_admission_contact_bindings where tribe_id=${tribeId} and contact_type=${contact.type} and normalized_contact is null and (${sql.join(matches, sql` or `)}) limit 1`)).rows[0];
  if (reserved) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.contactBindingConflict);
}
