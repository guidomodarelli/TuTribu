/** Guards original list configuration outcomes without returning contacts, owners or cryptographic material. @module allowlist-mutation-schemas */
import { z } from "zod";
import { ALLOWLIST_MUTATION_DENIAL, ALLOWLIST_MUTATION_DENIAL_CODES } from "../../constants/allowlist-management";
import type { AllowlistMutationResult } from "../../domain/repositories/allowlist-management";

/** Only the committed entry identity/version and change classification cross the mutation boundary. */
export const allowlistMutationResultSchema = z.strictObject({ entryId: z.uuid(), version: z.int().positive(), changed: z.boolean(), created: z.boolean() }).refine((result) => !result.created || result.changed && result.version === 1) satisfies z.ZodType<AllowlistMutationResult>;
/** A denial is an original ledger result, never a fabricated version-zero entry. */
export const allowlistMutationDenialSchema = z.strictObject({ outcome: z.literal(ALLOWLIST_MUTATION_DENIAL), code: z.enum(ALLOWLIST_MUTATION_DENIAL_CODES) });
/** Own JSON stored by the ledger is validated independently of trusted PostgreSQL rows. */
export const allowlistMutationSnapshotSchema = z.union([allowlistMutationResultSchema, allowlistMutationDenialSchema]);
