/** Validates only own reauthentication HTTP input, never auth provider responses or storage rows. */
import {z} from "zod";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";

/** Account/session/permission fields are derived from the real server session. */
export const createReauthenticationIntentSchema=z.strictObject({tribeId:z.uuid(),operation:z.enum(REAUTHENTICATION_OPERATION),resourceId:z.uuid(),returnPath:z.string().startsWith("/").refine((path)=>!path.startsWith("//")&&!path.includes("\\")),confirmed:z.literal(true)});
export const reauthenticationIntentParamsSchema=z.strictObject({intentId:z.uuid()});
