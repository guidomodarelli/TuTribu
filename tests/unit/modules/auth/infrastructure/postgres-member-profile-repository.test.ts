import { vi, describe, it, expect } from "vitest";
import { PostgresMemberProfileRepository } from "@/src/modules/auth/infrastructure/repositories/postgres-member-profile-repository";

const MEMBER_ID = "member-1";
const IMAGE_URL = "https://lh3.googleusercontent.com/a/new=s96-c";

describe("PostgresMemberProfileRepository", () => {
  it("returns the stored image for a member", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({ rows: [{ image: IMAGE_URL }] }); });
    const repository = new PostgresMemberProfileRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(repository.getImage(MEMBER_ID)).resolves.toBe(IMAGE_URL);
  });

  it("returns null when the member has no stored image", async () => {
    const repository = new PostgresMemberProfileRepository(async (callback) =>
      callback({ execute: vi.fn(async () => ({ rows: [] })) } as never)
    );

    await expect(repository.getImage(MEMBER_ID)).resolves.toBeNull();
  });
});
