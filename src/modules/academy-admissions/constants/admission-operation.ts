/** Names the technical claim lease and fingerprint domain without changing resource versions. */
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingMacKeyPurpose } from "@/src/modules/messaging/domain/value-objects/messaging-key-purpose";
const ADMISSION_OPERATION_LEASE_SECONDS = 90;
export const ADMISSION_OPERATION_LEASE_MS = ADMISSION_OPERATION_LEASE_SECONDS * MILLISECONDS_PER_SECOND;
export const ADMISSION_OPERATION_FINGERPRINT_DOMAIN = "tutribu.admission.operation.v1";
/** Requires immutable material for both the original payload and its contact identity before ledger use. */
export const ADMISSION_OPERATION_MAC_KEY_PURPOSES = [MESSAGING_KEY_PURPOSE.operationPayload, MESSAGING_KEY_PURPOSE.contactFingerprint] as const satisfies readonly MessagingMacKeyPurpose[];
/** Identifies an original ledger intent that still needs its retained payload key. */
export const ADMISSION_OPERATION_STARTED_STATE = "started";
/** Registers concurrent intents under shared scope locks; administrative effects retain exclusive tenant serialization. */
export const ADMISSION_OPERATION_TRIBE_LOCK_SQL = { registration: "for share", execution: "for update" } as const;
