/** Exercises the actual administrative contracts that prevent token recovery from original operation metadata. @module personal-invitation-management-contracts-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { personalInvitationMutationResultSchema, personalInvitationCreationResultSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-management-schemas";

describe("personal invitation administrative result contracts", () => {
  it("should allow initial token only with a new confirmed version-one creation and keep original replay metadata-only", () => {
    const result = { invitationId: randomUUID(), version: 1, changed: true, created: true }, operationId = randomUUID(), initialToken = randomBytes(32).toString("base64url");
    expect(personalInvitationCreationResultSchema.parse({ state: "completed", operationId, replayed: false, result, initialToken })).toEqual({ state: "completed", operationId, replayed: false, result, initialToken });
    expect(personalInvitationCreationResultSchema.parse({ state: "completed", operationId, replayed: true, result })).toEqual({ state: "completed", operationId, replayed: true, result });
    expect(personalInvitationCreationResultSchema.safeParse({ state: "completed", operationId, replayed: true, result, initialToken }).success).toBe(false);
    expect(personalInvitationCreationResultSchema.safeParse({ state: "started", operationId, initialToken }).success).toBe(false);
    expect(personalInvitationCreationResultSchema.safeParse({ state: "completed", operationId, replayed: false, result, initialToken: "x".repeat(43) }).success).toBe(false);
  });
  it("should reject a token in durable metadata or in an update/no-op and close unusable resource versions", () => {
    const result = { invitationId: randomUUID(), version: 1, changed: true, created: true }, initialToken = randomBytes(32).toString("base64url");
    for (const privateField of ["initialToken", "token", "lookupDigest", "tokenKeyId", "recipient"]) expect(personalInvitationMutationResultSchema.safeParse({ ...result, [privateField]: initialToken }).success).toBe(false);
    for (const altered of [{ ...result, version: 0 }, { ...result, created: false, changed: false }, { ...result, version: 2, created: false }]) expect(personalInvitationCreationResultSchema.safeParse({ state: "completed", operationId: randomUUID(), replayed: false, result: altered, initialToken }).success).toBe(false);
  });
});
