/** @jest-environment node */

import path from "node:path";
import { spawnSync } from "node:child_process";

function lintImport(source: string, filePath: string) {
  const eslintBin = path.join(process.cwd(), "node_modules", "eslint", "bin", "eslint.js");
  const result = spawnSync(
    process.execPath,
    [
      eslintBin,
      "--stdin",
      "--stdin-filename",
      filePath,
      "--format",
      "json",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      input: source,
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (!result.stdout) {
    throw new Error(
      `Expected eslint JSON output for ${filePath}, received none. stderr: ${result.stderr}`
    );
  }

  const [lintResult] = JSON.parse(result.stdout) as Array<{
    messages: Array<{ ruleId: string | null }>;
  }>;

  return lintResult.messages.map((message) => message.ruleId);
}

describe("eslint module boundaries", () => {
  it("rejects deprecated feature imports inside src/modules", async () => {
    expect(
      lintImport(
        'import legacyFeature from "@/src/features/auth";',
        "src/modules/auth/application/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });

  it("rejects setup imports inside module layers", async () => {
    expect(
      lintImport(
        'import { buildAuthModule } from "@/src/modules/auth/setup";',
        "src/modules/auth/application/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });

  it("rejects barrel setup imports inside module layers", async () => {
    expect(
      lintImport(
        'import { createRequestModules } from "@/src/modules/setup";',
        "src/modules/auth/application/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });

  it("rejects relative setup imports inside module layers", async () => {
    expect(
      lintImport(
        'import { buildAuthModule } from "../../setup";',
        "src/modules/auth/application/use-cases/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });

  it("rejects relative setup imports from another module", async () => {
    expect(
      lintImport(
        'import { buildAuthModule } from "../../auth/setup";',
        "src/modules/storage/application/foo.ts"
      )
    ).toContain("no-restricted-imports");
  });
});
