/** @vitest-environment node */
/** Exercises administrative uncertainty through only owned delete/read ports. @module confirm-owned-branch-removal-tests */
import { describe, expect, it, vi } from "vitest";
import { confirmOwnedBranchRemoval } from "./confirm-owned-branch-removal";

/** Keeps retries instantaneous; the bounds themselves are what the cases exercise. */
const noWait = { wait: async () => undefined };

describe("exact owned branch removal", () => {
  it("should accept confirmed absence after losing the delete response without repeating deletion", async () => {
    const remove = vi.fn(async () => { throw new Error("Synthetic deletion response loss"); }), remains = vi.fn(async () => false);
    await expect(confirmOwnedBranchRemoval(remove, remains, noWait)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledOnce();
    expect(remains).toHaveBeenCalledOnce();
  });
  it("should repeat the exact delete when the provider refused it and the branch is still present", async () => {
    const remove = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(new Error("Synthetic locked branch")).mockResolvedValue(undefined);
    const remains = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(confirmOwnedBranchRemoval(remove, remains, noWait)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remains).toHaveBeenCalledTimes(2);
  });
  it("should preserve every failure when the exact branch remains after all bounded attempts", async () => {
    const cause = new Error("Synthetic administrative transport error"), remove = vi.fn(async () => { throw cause; }), wait = vi.fn(async () => undefined);
    await expect(confirmOwnedBranchRemoval(remove, async () => true, { attempts: 3, retryDelayMs: 10, wait })).rejects.toMatchObject({ cause, errors: [cause, cause, cause, expect.any(Error)] });
    expect(remove).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[10], [20]]);
  });
  it("should require a presence check even after a successful response and retain lookup failure", async () => {
    const cause = new Error("Synthetic lookup failure"), remove = vi.fn(async () => undefined);
    await expect(confirmOwnedBranchRemoval(remove, async () => { throw cause; }, { ...noWait, attempts: 2 })).rejects.toMatchObject({ cause });
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
