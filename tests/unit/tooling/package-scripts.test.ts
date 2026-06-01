/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";

type PackageScripts = Record<string, string>;

interface PackageManifest {
  scripts?: PackageScripts;
}

function readPackageScripts(): PackageScripts {
  const packageJson = JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8")
  ) as PackageManifest;

  return packageJson.scripts ?? {};
}

function getPnpmRunTargets(script: string): string[] {
  const pnpmRunPattern = /\bpnpm\s+run\s+([a-z:.-]+)/gu;

  return Array.from(script.matchAll(pnpmRunPattern), (match) => match[1]);
}

describe("package scripts", () => {
  it("keeps next build in the shared CI contract used by GitHub Actions", () => {
    const scripts = readPackageScripts();
    const ciScript = scripts.ci ?? "";

    expect(getPnpmRunTargets(ciScript)).toContain("build");
    expect(scripts.build).toBe("next build");
  });
});
