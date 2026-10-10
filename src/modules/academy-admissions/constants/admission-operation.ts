/** Names the technical claim lease and fingerprint domain without changing resource versions. */
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
const ADMISSION_OPERATION_LEASE_SECONDS = 90;
export const ADMISSION_OPERATION_LEASE_MS = ADMISSION_OPERATION_LEASE_SECONDS * MILLISECONDS_PER_SECOND;
export const ADMISSION_OPERATION_FINGERPRINT_DOMAIN = "tutribu.admission.operation.v1";
/** Registers concurrent intents under shared scope locks; business effects retain exclusive serialization. */
export const ADMISSION_OPERATION_TRIBE_LOCK_SQL = { registration: "for share", execution: "for update" } as const;
