import { PostgresTribeFreeJoinRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-free-join-repository";
import { PostgresTribePresenceRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-presence-repository";
import { TRIBE_FREE_JOIN_STATUS } from "@/src/modules/tribes/constants/tribe-story";

describe("PostgresTribeFreeJoinRepository", () => {
  it("returns joined when the membership insert succeeds", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [{ joined: true, tribe_available: true }],
    });
    const repository = new PostgresTribeFreeJoinRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.join({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({ status: TRIBE_FREE_JOIN_STATUS.joined });
  });

  it("returns alreadyMember when the tribe is joinable but no row was inserted", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [{ joined: false, tribe_available: true }],
    });
    const repository = new PostgresTribeFreeJoinRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.join({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({ status: TRIBE_FREE_JOIN_STATUS.alreadyMember });
  });

  it("returns forbidden when the tribe does not allow free open join", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [{ joined: false, tribe_available: false }],
    });
    const repository = new PostgresTribeFreeJoinRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.join({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({ status: TRIBE_FREE_JOIN_STATUS.forbidden });
  });

  it("maps an RLS rejection to forbidden", async () => {
    const rlsError = Object.assign(new Error("blocked by policy"), {
      code: "42501",
    });
    const execute = jest.fn().mockRejectedValueOnce(rlsError);
    const repository = new PostgresTribeFreeJoinRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.join({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({ status: TRIBE_FREE_JOIN_STATUS.forbidden });
  });
});

describe("PostgresTribePresenceRepository", () => {
  it("reports whether the membership presence was touched", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [{ touched: true }],
    });
    const repository = new PostgresTribePresenceRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.touchByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toBe(true);
  });

  it("returns false when the presence function is not deployed yet", async () => {
    const missingFunctionError = Object.assign(new Error("missing"), {
      code: "42883",
    });
    const execute = jest.fn().mockRejectedValueOnce(missingFunctionError);
    const repository = new PostgresTribePresenceRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.touchByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toBe(false);
  });
});
