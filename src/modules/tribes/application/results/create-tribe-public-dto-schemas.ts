import { z } from "zod";

import type { CreateTribePublicResponse } from "@/src/modules/tribes/application/results/create-tribe-result";
import {
  CREATE_TRIBE_ERROR_CODE,
  CREATE_TRIBE_STATUS,
} from "@/src/modules/tribes/constants/create-tribe";

/**
 * Runtime contract (allowlist) of the public JSON body of `POST /api/tribes`.
 * The route parses its response with it before sending it, and the browser
 * adapter parses the same schema with `safeParse` before using a response.
 */

/**
 * Same-origin absolute path: starts with one `/` and never with `//` or `/\`,
 * which browsers would read as a protocol-relative URL to another host.
 */
const SAME_ORIGIN_PATH_PATTERN = /^\/(?![/\\])/;

const sameOriginPathSchema = z.string().regex(SAME_ORIGIN_PATH_PATTERN);
const safeMessageSchema = z.string().min(1);

export const createTribePublicResponseSchema = z.discriminatedUnion("status", [
  z.object({
    redirectUrl: sameOriginPathSchema,
    status: z.literal(CREATE_TRIBE_STATUS.created),
  }),
  z.object({
    redirectUrl: sameOriginPathSchema,
    status: z.literal(CREATE_TRIBE_ERROR_CODE.unauthenticated),
  }),
  z.object({
    message: safeMessageSchema,
    status: z.literal(CREATE_TRIBE_STATUS.slugConflict),
    suggestedSlug: z.string().min(1),
  }),
  z.object({
    message: safeMessageSchema,
    status: z.enum([
      CREATE_TRIBE_STATUS.invalidName,
      CREATE_TRIBE_STATUS.invalidSlug,
      CREATE_TRIBE_STATUS.notAllowed,
      CREATE_TRIBE_ERROR_CODE.unexpected,
    ]),
  }),
]) satisfies z.ZodType<CreateTribePublicResponse>;
