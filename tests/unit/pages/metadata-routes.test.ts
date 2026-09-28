import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import sitemap from "@/app/sitemap";
import { createMaintenanceModules } from "@/src/modules/setup";

vi.mock("@/src/modules/setup", () => ({
  createMaintenanceModules: vi.fn(),
}));

const listPublicTribeStorySlugs = vi.fn();

const TEST_PUBLIC_APP_BASE_URL = "https://tutribu.example.com";

describe("metadata routes", () => {
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_URL = TEST_PUBLIC_APP_BASE_URL;
    listPublicTribeStorySlugs.mockResolvedValue([]);
    (createMaintenanceModules as Mock).mockResolvedValue({
      tribes: {
        useCases: {
          listPublicTribeStorySlugs,
        },
      },
    });
  });

  afterEach(() => {
    if (previousBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
      return;
    }

    process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
  });

  it("exposes the public home page in the sitemap", async () => {
    await expect(sitemap()).resolves.toEqual([
      {
        url: TEST_PUBLIC_APP_BASE_URL + "/",
        changeFrequency: "weekly",
        priority: 1,
      },
    ]);
  });

  it("includes the story pages of publicly joinable tribes", async () => {
    listPublicTribeStorySlugs.mockResolvedValue(["tribu-libre"]);

    await expect(sitemap()).resolves.toEqual([
      {
        url: TEST_PUBLIC_APP_BASE_URL + "/",
        changeFrequency: "weekly",
        priority: 1,
      },
      {
        url: TEST_PUBLIC_APP_BASE_URL + "/tribu-libre/historia",
        changeFrequency: "weekly",
        priority: 0.7,
      },
    ]);
  });

  it("keeps serving the static sitemap entries when the database is unreachable", async () => {
    listPublicTribeStorySlugs.mockRejectedValue(new Error("db down"));

    await expect(sitemap()).resolves.toEqual([
      {
        url: TEST_PUBLIC_APP_BASE_URL + "/",
        changeFrequency: "weekly",
        priority: 1,
      },
    ]);
  });
});
