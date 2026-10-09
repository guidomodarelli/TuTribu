/** Guards own private metadata and one-view HTTP outcomes, never SQL rows or provider payloads. @module personal-invitation-http-schemas */
import { z } from "zod";
import { personalInvitationSchema } from "../application/results/admission-public-result-schemas";
import { personalInvitationMutationResultSchema } from "./personal-invitation-management-schemas";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ADMISSION_INVITATION_PUBLIC_PATH_PREFIX, ADMISSION_PUBLIC_URL_PROTOCOL } from "./admission-management-contract";
import { PERSONAL_INVITATION_TOKEN } from "./personal-invitation-token";

/** Current private history is separate from the historical command snapshot and cannot recover a URL. */
export const personalInvitationPageSchema = z.strictObject({ items: z.array(personalInvitationSchema), nextCursor: z.string().nullable() });

/**
 * Binds transient creation material to server configuration and a canonical token route.
 * @param trustedOrigin - Deployment configuration, never native Host, Origin or browser input.
 * @returns Original progress or versioned metadata, with a URL only on newly acknowledged creation.
 */
export function createPersonalInvitationHttpCreationSchema(trustedOrigin: string) {
  const origin = new URL(trustedOrigin).origin;
  const invitationUrl = z.url().refine((value) => {
    const url = new URL(value), token = url.pathname.startsWith(ADMISSION_INVITATION_PUBLIC_PATH_PREFIX) ? url.pathname.slice(ADMISSION_INVITATION_PUBLIC_PATH_PREFIX.length) : "";
    return url.origin === origin && !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === ADMISSION_PUBLIC_URL_PROTOCOL.secure || url.protocol === ADMISSION_PUBLIC_URL_PROTOCOL.local)
      && PERSONAL_INVITATION_TOKEN.canonicalPattern.test(token);
  });
  return z.union([
    z.strictObject({ state: z.literal(OPERATION_STATE.started), operationId: z.uuid() }),
    z.strictObject({ state: z.literal(OPERATION_STATE.completed), operationId: z.uuid(), replayed: z.literal(true), result: personalInvitationMutationResultSchema }),
    z.strictObject({ state: z.literal(OPERATION_STATE.completed), operationId: z.uuid(), replayed: z.literal(false), result: personalInvitationMutationResultSchema, invitationUrl: invitationUrl.optional() }).refine((operation) => operation.invitationUrl === undefined || operation.result.created && operation.result.changed && operation.result.version === 1),
  ]);
}
