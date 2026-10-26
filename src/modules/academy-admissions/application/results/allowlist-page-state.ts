/** Guards current leader list SSR props without native session or private storage contracts. @module allowlist-page-state */
import { z } from "zod";
import { allowlistPageSchema } from "./allowlist-query-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "../../constants/admission-errors";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { ALLOWLIST_ENTRY_STATUS } from "../../constants/admission-resources";
import { ADMISSION_QUERY_LIMIT } from "../../constants/admission-public-contract";

/** Browser filters contain an opaque cursor; the API boundary parses its own tuple. */
export const allowlistBrowserQuerySchema = z.strictObject({ limit: z.int().min(1).max(ADMISSION_QUERY_LIMIT.maximumPageSize), search: z.string().max(ADMISSION_QUERY_LIMIT.searchCharacters).optional(), status: z.enum(ALLOWLIST_ENTRY_STATUS).optional(), cursor: z.string().max(ADMISSION_QUERY_LIMIT.cursorCharacters).optional() });
export const allowlistPageStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), slug: z.string().min(1), tribeId: z.uuid(), viewerId: z.string().min(1), renderedAt: z.iso.datetime({ offset: true }), contactType: z.enum(ADMISSION_CONTACT_TYPE).nullable(), page: allowlistPageSchema, query: allowlistBrowserQuerySchema }),
  z.strictObject({ kind: z.literal("unavailable"), code: z.enum(ADMISSION_ERROR_CODE), message: z.string() }).refine((state) => state.message === ADMISSION_ERROR_MESSAGE[state.code]),
]);
export type AllowlistPageState = z.infer<typeof allowlistPageStateSchema>;
export type AllowlistBrowserQuery = z.infer<typeof allowlistBrowserQuerySchema>;
