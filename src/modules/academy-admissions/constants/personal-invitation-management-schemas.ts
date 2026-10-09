/** Guards private administrative results and keeps one-view tokens out of durable/replayed snapshots. @module personal-invitation-management-schemas */
import { z } from "zod";
import type { PersonalInvitationCreationResult, PersonalInvitationMutationResult } from "../domain/repositories/personal-invitation-management";
import type { AdmissionOperationResult } from "../domain/entities/admission-operation";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { PERSONAL_INVITATION_TOKEN } from "./personal-invitation-token";
import { PERSONAL_INVITATION_DENIAL_CODES, PERSONAL_INVITATION_MUTATION_DENIED } from "./personal-invitation-management";

/** Exact durable metadata, with no recipient, token, digest, key or access effect. */
export const personalInvitationMutationResultSchema = z.strictObject({ invitationId: z.uuid(), version: z.int().positive(), changed: z.boolean(), created: z.boolean() }).refine((result) => !result.created || result.changed && result.version === 1) satisfies z.ZodType<PersonalInvitationMutationResult>;
/** Expected original refusal stores only its closed code, never token, contact or an invented version. */
export const personalInvitationMutationDenialSchema = z.strictObject({ outcome: z.literal(PERSONAL_INVITATION_MUTATION_DENIED), code: z.enum(PERSONAL_INVITATION_DENIAL_CODES) });
/** Original storage/recovery permits metadata success or completed business refusal only. */
export const personalInvitationMutationSnapshotSchema = z.union([personalInvitationMutationResultSchema, personalInvitationMutationDenialSchema]);
/** Administrative update envelopes allow original metadata only, including when still in progress. */
export const personalInvitationMutationOperationSchema = z.union([
  z.strictObject({ state: z.literal(OPERATION_STATE.started), operationId: z.uuid() }),
  z.strictObject({ state: z.literal(OPERATION_STATE.completed), operationId: z.uuid(), replayed: z.boolean(), result: personalInvitationMutationResultSchema }),
]) satisfies z.ZodType<AdmissionOperationResult<PersonalInvitationMutationResult>>;
/** Started/replay cannot carry a token; only a newly confirmed creation may return initial material. */
export const personalInvitationCreationResultSchema = z.union([
  z.strictObject({ state: z.literal(OPERATION_STATE.started), operationId: z.uuid() }),
  z.strictObject({ state: z.literal(OPERATION_STATE.completed), operationId: z.uuid(), replayed: z.literal(true), result: personalInvitationMutationResultSchema }),
  z.strictObject({ state: z.literal(OPERATION_STATE.completed), operationId: z.uuid(), replayed: z.literal(false), result: personalInvitationMutationResultSchema, initialToken: z.string().regex(PERSONAL_INVITATION_TOKEN.canonicalPattern).optional() }).refine((operation) => operation.initialToken === undefined || operation.result.created && operation.result.changed && operation.result.version === 1),
]) satisfies z.ZodType<PersonalInvitationCreationResult>;
