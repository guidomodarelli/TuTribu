/** @vitest-environment node */
/** Exercises administrative uncertainty through only owned delete/read ports. @module confirm-owned-branch-removal-tests */
import { describe, expect, it, vi } from "vitest";
import { confirmOwnedBranchRemoval } from "./confirm-owned-branch-removal";

describe("exact owned branch removal", () => {
  it("should accept confirmed absence after losing the delete response without repeating deletion", async () => {
    const remove = vi.fn(async () => { throw new Error("Synthetic deletion response loss"); }), remains = vi.fn(async () => false);
    await expect(confirmOwnedBranchRemoval(remove, remains)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledOnce();
    expect(remains).toHaveBeenCalledOnce();
  });
  it("should preserve cleanup failure when the exact branch remains after an uncertain delete", async () => {
    const cause = new Error("Synthetic administrative transport error"), remove = vi.fn(async () => { throw cause; });
    await expect(confirmOwnedBranchRemoval(remove, async () => true)).rejects.toMatchObject({ cause, errors: [cause, expect.any(Error)] });
    expect(remove).toHaveBeenCalledOnce();
  });
  it("should require a presence check even after a successful response and retain lookup failure", async () => {
    const cause = new Error("Synthetic lookup failure"), remove = vi.fn(async () => undefined);
    await expect(confirmOwnedBranchRemoval(remove, async () => { throw cause; })).rejects.toMatchObject({ cause });
    expect(remove).toHaveBeenCalledOnce();
  });
});
