import { vi, describe, it, expect } from "vitest";
import { TRIBE_WELCOME_SELECTION_STATUS } from "@/src/modules/tribes/constants/tribe-welcome";
import { PostgresTribeWelcomeSelectionRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-welcome-selection-repository";

type DrizzleQueryWithChunks = {
  queryChunks?: unknown[];
};

function readQueryText(query: unknown): string {
  if (!query || typeof query !== "object" || !("queryChunks" in query)) {
    return "";
  }

  const { queryChunks } = query as DrizzleQueryWithChunks;

  return (queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value?: unknown }).value)
      ) {
        return (chunk as { value: unknown[] }).value.join("");
      }

      return "";
    })
    .join(" ");
}

describe("PostgresTribeWelcomeSelectionRepository", () => {
  it("checks active membership before recording welcome selections", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          status: TRIBE_WELCOME_SELECTION_STATUS.forbidden,
        },
      ],
    }); });
    const repository = new PostgresTribeWelcomeSelectionRepository(
      async (callback) => callback({ execute } as never)
    );

    await expect(
      repository.record({
        tribeSlug: "matematica-pro",
        welcomeLinkId: "11111111-1111-4111-8111-111111111111",
      })
    ).resolves.toEqual({ status: TRIBE_WELCOME_SELECTION_STATUS.forbidden });

    const queryText = readQueryText(execute.mock.calls[0]?.[0]);

    expect(queryText).toContain("active_membership as");
    expect(queryText).toContain("tribe_members.status = 'active'");
    expect(queryText).not.toContain(
      "tribe_members.status IN ('active', 'muted')"
    );
  });

  it("classifies forbidden access before invalid welcome links", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          status: TRIBE_WELCOME_SELECTION_STATUS.forbidden,
        },
      ],
    }); });
    const repository = new PostgresTribeWelcomeSelectionRepository(
      async (callback) => callback({ execute } as never)
    );

    await repository.record({
      tribeSlug: "matematica-pro",
      welcomeLinkId: "11111111-1111-4111-8111-111111111111",
    });

    const queryText = readQueryText(execute.mock.calls[0]?.[0]);
    const forbiddenStatusIndex = queryText.indexOf(
      TRIBE_WELCOME_SELECTION_STATUS.forbidden
    );
    const invalidLinkStatusIndex = queryText.indexOf(
      TRIBE_WELCOME_SELECTION_STATUS.invalidLink
    );

    expect(forbiddenStatusIndex).toBeGreaterThan(-1);
    expect(invalidLinkStatusIndex).toBeGreaterThan(forbiddenStatusIndex);
    expect(queryText).toContain(
      "when not exists (select 1 from active_membership)"
    );
  });

  it("propagates missing selection storage instead of treating it as no selections", async () => {
    const missingStorageError = {
      cause: {
        code: "42P01",
      },
    };
    const execute = vi.fn(async (...args: unknown[]) => { void args;
      throw missingStorageError;
    });
    const repository = new PostgresTribeWelcomeSelectionRepository(
      async (callback) => callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).rejects.toBe(missingStorageError);
  });

});
