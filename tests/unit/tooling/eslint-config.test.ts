/** @vitest-environment node */

import { beforeAll, describe, it, expect } from "vitest";
import { ESLint } from "eslint";

/** Cold loading the actual Next ESLint presets can exceed a unit-test timeout. */
const ESLINT_SETUP_TIMEOUT_MS = 120_000;
const eslint = new ESLint({ cwd: process.cwd() });

beforeAll(async () => {
  await eslint.calculateConfigForFile("src/modules/auth/application/foo.ts");
}, ESLINT_SETUP_TIMEOUT_MS);

/** Runs the real repository rules without restarting Node for every input. */
async function lintImport(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.map((message) => message.ruleId);
}

describe("eslint module boundaries", () => {
  it("rejects deprecated feature imports inside src/modules", async () => {
    expect(
      await lintImport(
        'import legacyFeature from "@/src/features/auth";',
        "src/modules/auth/application/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });

  it("rejects setup imports inside module layers", async () => {
    expect(
      await lintImport(
        'import { buildAuthModule } from "@/src/modules/auth/setup";',
        "src/modules/auth/application/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });

  it("rejects barrel setup imports inside module layers", async () => {
    expect(
      await lintImport(
        'import { createRequestModules } from "@/src/modules/setup";',
        "src/modules/auth/application/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });

  it("rejects relative setup imports inside module layers", async () => {
    expect(
      await lintImport(
        'import { buildAuthModule } from "../../setup";',
        "src/modules/auth/application/use-cases/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });

  it("rejects relative setup imports from another module", async () => {
    expect(
      await lintImport(
        'import { buildAuthModule } from "../../auth/setup";',
        "src/modules/storage/application/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });

  it("rejects SitePing widget imports inside the SitePing module", async () => {
    expect(
      await lintImport(
        'import type { FeedbackType } from "@siteping/widget";',
        "src/modules/siteping/application/use-cases/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });
});

describe("eslint generated output boundaries", () => {
  it("ignores OpenNext Cloudflare generated output", async () => {
    expect(
      await lintImport(
        "// @ts-ignore\nconst generatedValue = 1;",
        ".open-next/cloudflare/init.js"
      )
    ).not.toEqual(
      expect.arrayContaining([
        "@typescript-eslint/ban-ts-comment",
        "@typescript-eslint/no-unused-vars",
      ])
    );
  });

  it("ignores the Cloudflare Workers entrypoint", async () => {
    expect(
      await lintImport(
        "// @ts-ignore\nconst generatedValue = 1;",
        "cloudflare/worker.ts"
      )
    ).not.toEqual(
      expect.arrayContaining([
        "@typescript-eslint/ban-ts-comment",
        "@typescript-eslint/no-unused-vars",
      ])
    );
  });

  it("ignores agent-generated worktrees", async () => {
    expect(
      await lintImport(
        "// @ts-ignore\nconst generatedValue = 1;",
        ".claude/worktrees/review-copy/components/example.tsx"
      )
    ).not.toEqual(
      expect.arrayContaining([
        "@typescript-eslint/ban-ts-comment",
        "@typescript-eslint/no-unused-vars",
      ])
    );
  });
});
