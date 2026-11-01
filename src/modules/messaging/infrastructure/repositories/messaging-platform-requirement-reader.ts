/** Names the read a messaging page uses to know, inside its own authorized transaction, whether its writes can be protected. @module messaging-platform-requirement-reader */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/**
 * Runs the same import and enrolled-proof checks the ledger runs before a write; the attestation needs the native identity
 * of the read transaction. Null when the platform can protect the page's writes.
 */
export type MessagingPlatformRequirementReader = (database: RequestDatabase) => Promise<PlatformSecurityRequirement | null>;
