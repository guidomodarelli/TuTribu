/** Owns shared native route/query primitives independently of application and HTTP execution. @module admission-route-input */
import { z } from "zod";
import { TRIBE_SLUG_PATTERN } from "@/src/modules/tribes/domain/value-objects/tribe-slug";
import { ADMISSION_QUERY_INTEGER_PATTERN, ADMISSION_QUERY_LIMIT } from "./admission-public-contract";
import { ADMISSION_INVITATION_STATUS } from "./admission-eligibility";
import { PERSONAL_INVITATION_CURSOR } from "./personal-invitation-management";

/** Native slug is data; actor, role and tenant authority never come from params. */
export const admissionTribeParamsSchema = z.strictObject({ slug: z.string().regex(TRIBE_SLUG_PATTERN) });
/** An empty native query rejects hidden authority and alternate commands. */
export const admissionEmptyQuerySchema = z.strictObject({});
/** Decimal-only bounded pagination is shared by actual private routes and SSR. */
export const admissionPageSizeSchema = z.union([z.int(), z.string().regex(ADMISSION_QUERY_INTEGER_PATTERN).transform(Number)]).pipe(z.int().min(1).max(ADMISSION_QUERY_LIMIT.maximumPageSize)).default(ADMISSION_QUERY_LIMIT.defaultPageSize);
/** Private history retains PostgreSQL microseconds and canonicalizes only its own opaque UUID cursor. */
export const admissionInvitationQuerySchema = z.strictObject({ limit: admissionPageSizeSchema, status: z.enum(ADMISSION_INVITATION_STATUS).optional(), cursor: z.string().max(ADMISSION_QUERY_LIMIT.cursorCharacters).transform((cursor) => cursor.split(PERSONAL_INVITATION_CURSOR.separator)).pipe(z.tuple([z.iso.datetime({ offset: true }), z.uuid()])).transform(([createdAt, id]) => ({ createdAt, id: id.toLowerCase() })).optional() });
/** The primary management SSR entrypoint validates params/query together once before composition. */
export const admissionInvitationPageInputSchema = z.strictObject({ params: admissionTribeParamsSchema, query: admissionInvitationQuerySchema });
