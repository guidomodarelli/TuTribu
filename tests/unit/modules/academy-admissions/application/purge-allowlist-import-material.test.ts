/** Exercises bounded temporary-import minimization through its own public application port. @module purge-allowlist-import-material-tests */
import { describe, expect, it, vi } from "vitest";
import { PurgeAllowlistImportMaterialUseCase } from "@/src/modules/academy-admissions/application/use-cases/purge-allowlist-import-material-use-case";

describe("temporary allowlist import material maintenance", () => {
  it("should publish only confirmed row counts and use a bounded default without returning file data", async () => {
    const purge = vi.fn().mockResolvedValue({ purgedRows: 3, completedImports: 1 });
    expect(await new PurgeAllowlistImportMaterialUseCase({ purge }).execute()).toEqual({ purgedRows: 3, completedImports: 1 });
    expect(purge).toHaveBeenCalledOnce(); expect(purge).toHaveBeenCalledWith({ limit: 500 });
  });
  it.each([0, -1, 2001, 0.5, Number.NaN, Number.POSITIVE_INFINITY])("should reject an invalid row limit before opening its maintenance port: %s", async (limit) => {
    const purge = vi.fn();
    await expect(new PurgeAllowlistImportMaterialUseCase({ purge }).execute({ limit })).rejects.toMatchObject({ code: "invalid_input" });
    expect(purge).not.toHaveBeenCalled();
  });
  it("should preserve an unconfirmed owner failure without inventing an empty successful batch", async () => {
    const failure = new Error("Controlled temporary-import commit response unavailable"), purge = vi.fn().mockRejectedValue(failure);
    await expect(new PurgeAllowlistImportMaterialUseCase({ purge }).execute({ limit: 2 })).rejects.toBe(failure);
    expect(purge).toHaveBeenCalledWith({ limit: 2 });
  });
});
