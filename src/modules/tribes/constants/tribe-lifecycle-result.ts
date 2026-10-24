/** Validates the minimal original lifecycle result owned by the middleend. @module tribe-lifecycle-result */
import { z } from "zod";
import { TRIBE_LIFECYCLE_ACTION } from "./tribe-lifecycle";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
/** Deletion carries no live configuration or retired resource identifiers. */
export const tribeLifecycleResultSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal(TRIBE_LIFECYCLE_ACTION.exitAcademy), deleted: z.literal(false), accessModel: z.literal(TRIBE_ACCESS_MODEL.legacy), configVersion: z.number().int().positive() }),
  z.strictObject({ action: z.literal(TRIBE_LIFECYCLE_ACTION.deleteTribe), deleted: z.literal(true), accessModel: z.null(), configVersion: z.null() }),
]);
