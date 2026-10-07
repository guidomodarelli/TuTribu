/** Guards minimal own connection metadata without credential or private provider references. @module messaging-connection-mutation-result */
import { z } from "zod";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_GENERIC_CREDENTIAL_MASK } from "@/src/modules/messaging/constants/messaging-public-contract";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

/** Separates mutable lifecycle version from immutable effective configuration version. */
export type MessagingConnectionMutationResult = { id: string; name: string; version: number; configurationVersion: number; state: "draft" | "ready" | "active" | "degraded" | "suspended" | "disconnected"; maskedCredential: "••••••••" };
/** The same own guard applies at ledger storage, HTTP projection and browser consumption. */
export const messagingConnectionMutationSchema = z.object({ id:z.uuid(),name:z.string().min(1).max(ADMISSION_LIMIT.displayNameCharacters),version:z.int().positive(),configurationVersion:z.int().positive(),state:z.enum(MESSAGING_CONNECTION_STATE),maskedCredential:z.literal(MESSAGING_GENERIC_CREDENTIAL_MASK) }) satisfies z.ZodType<MessagingConnectionMutationResult>;
