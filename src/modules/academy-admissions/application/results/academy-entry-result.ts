/** Owns historical direct-entry responses independently of explicit admission outcomes. @module academy-entry-result */
import { z } from "zod";
/** Historical success carries no operation, proof, role grant or pending request. */
export const legacyAcademyJoinSchema = z.object({ status: z.enum(["admission_closed", "already_member", "blocked", "joined"]), message: z.string() });
export type LegacyAcademyJoinDto = z.infer<typeof legacyAcademyJoinSchema>;
