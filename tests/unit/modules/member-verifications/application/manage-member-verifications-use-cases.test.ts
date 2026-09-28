import { describe, expect, it, vi } from "vitest";

import {
  requestMemberVerification,
  reviewMemberVerification,
  saveVerificationProvider,
} from "@/src/modules/member-verifications/application/use-cases/manage-member-verifications-use-cases";
import type { MemberVerificationRepository } from "@/src/modules/member-verifications/domain/repositories/member-verification-repository";

const PROVIDER_ID = "3f2b8c1d-4e5a-4b6c-8d7e-9f0a1b2c3d4e";

function buildRepository(
  overrides: Partial<MemberVerificationRepository> = {}
): MemberVerificationRepository {
  return {
    listOwn: vi.fn(async () => []),
    listProviders: vi.fn(async () => []),
    listReviewQueue: vi.fn(async () => ({ items: [], total: 0 })),
    request: vi.fn(async () => ({ status: "forbidden" as const })),
    review: vi.fn(async () => ({ status: "forbidden" as const })),
    saveProvider: vi.fn(async () => ({ status: "forbidden" as const })),
    ...overrides,
  };
}

describe("requestMemberVerification", () => {
  it("normalizes the optional declared email", async () => {
    const request = vi.fn(async () => ({ status: "forbidden" as const }));
    const execute = requestMemberVerification({
      memberVerificationRepository: buildRepository({ request }),
    });

    await execute({
      correlationId: "request-1",
      declaredEmail: "  Cuenta@Broker.Example  ",
      providerId: PROVIDER_ID,
      tribeSlug: "Matematica-Pro",
    });
    await execute({
      correlationId: "request-2",
      declaredEmail: "   ",
      providerId: PROVIDER_ID,
      tribeSlug: "matematica-pro",
    });

    expect(request).toHaveBeenNthCalledWith(1, {
      correlationId: "request-1",
      declaredEmail: "cuenta@broker.example",
      providerId: PROVIDER_ID,
      tribeSlug: "matematica-pro",
    });
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({ declaredEmail: null }));
  });

  it("rejects a malformed email", async () => {
    const request = vi.fn();
    const execute = requestMemberVerification({
      memberVerificationRepository: buildRepository({ request }),
    });

    await expect(
      execute({
        correlationId: "request-1",
        declaredEmail: "no-es-un-email",
        providerId: PROVIDER_ID,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "invalid_input" });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("saveVerificationProvider", () => {
  const command = {
    correlationId: "request-1",
    displayName: " Broker A ",
    instructions: "Abrí tu cuenta con el enlace.",
    isActive: true,
    key: "Broker-A",
    linkUrl: "https://broker.example/alta",
    providerId: null,
    tribeSlug: "matematica-pro",
  };

  it("normalizes key and display name", async () => {
    const saveProvider = vi.fn(async () => ({ status: "forbidden" as const }));
    const execute = saveVerificationProvider({
      memberVerificationRepository: buildRepository({ saveProvider }),
    });

    await execute(command);

    expect(saveProvider).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Broker A", key: "broker-a" })
    );
  });

  it.each([
    ["a non https link", { linkUrl: "http://broker.example" }],
    ["a javascript link", { linkUrl: "javascript:alert(1)" }],
    ["a key with spaces", { key: "broker a" }],
  ])("rejects %s", async (_label, override) => {
    const saveProvider = vi.fn();
    const execute = saveVerificationProvider({
      memberVerificationRepository: buildRepository({ saveProvider }),
    });

    await expect(execute({ ...command, ...override })).resolves.toEqual({
      status: "invalid_input",
    });
    expect(saveProvider).not.toHaveBeenCalled();
  });
});

describe("reviewMemberVerification", () => {
  it("passes a null reason when it is too short to explain a decision", async () => {
    const review = vi.fn(async () => ({ status: "reason_required" as const }));
    const execute = reviewMemberVerification({
      memberVerificationRepository: buildRepository({ review }),
    });

    await expect(
      execute({
        correlationId: "request-1",
        decision: "rejected",
        expectedVersion: 2,
        reason: " no ",
        tribeSlug: "matematica-pro",
        verificationId: PROVIDER_ID,
      })
    ).resolves.toEqual({ status: "reason_required" });
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ reason: null }));
  });

  it("rejects an invalid expected version", async () => {
    const review = vi.fn();
    const execute = reviewMemberVerification({
      memberVerificationRepository: buildRepository({ review }),
    });

    await expect(
      execute({
        correlationId: "request-1",
        decision: "verified",
        expectedVersion: 0,
        reason: "",
        tribeSlug: "matematica-pro",
        verificationId: PROVIDER_ID,
      })
    ).resolves.toEqual({ status: "invalid_input" });
  });
});
