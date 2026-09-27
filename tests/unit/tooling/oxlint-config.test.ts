/** @vitest-environment node */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type OxlintDiagnostic = { code: string; filename: string };

const REPOSITORY_ROOT = process.cwd();
const OXLINT_CONFIG_FILE_NAME = ".oxlintrc.json";
const LOCAL_PLUGIN_PREFIX = "./";
const RESTRICTED_IMPORTS_CODE = "eslint(no-restricted-imports)";
const LINT_DISABLE_CODE = "no-lint-disable(no-lint-disable)";
const MAGIC_STRINGS_CODE = "no-magic(no-magic-strings)";
const BAN_TS_COMMENT_CODE = "typescript(ban-ts-comment)";
const UNUSED_VARS_CODE = "eslint(no-unused-vars)";
const GENERATED_SOURCE = "// @ts-ignore\nconst generatedValue = 1;";

/** Each fixture is written at its repository-relative path so config overrides and ignores apply. */
const FIXTURES = {
  deprecatedFeatureImport: {
    filePath: "src/modules/auth/application/deprecated-feature.ts",
    source: 'import legacyFeature from "@/src/features/auth";\nexport { legacyFeature };',
  },
  moduleSetupImport: {
    filePath: "src/modules/auth/application/module-setup.ts",
    source: 'import { buildAuthModule } from "@/src/modules/auth/setup";\nexport { buildAuthModule };',
  },
  barrelSetupImport: {
    filePath: "src/modules/auth/application/barrel-setup.ts",
    source: 'import { createRequestModules } from "@/src/modules/setup";\nexport { createRequestModules };',
  },
  relativeSetupImport: {
    filePath: "src/modules/auth/application/use-cases/relative-setup.ts",
    source: 'import { buildAuthModule } from "../../setup";\nexport { buildAuthModule };',
  },
  crossModuleSetupImport: {
    filePath: "src/modules/storage/application/cross-module-setup.ts",
    source: 'import { buildAuthModule } from "../../auth/setup";\nexport { buildAuthModule };',
  },
  sitepingWidgetImport: {
    filePath: "src/modules/siteping/application/use-cases/widget-import.ts",
    source: 'import type { FeedbackType } from "@siteping/widget";\nexport type { FeedbackType };',
  },
  eslintDisableDirective: {
    filePath: "lib/eslint-disable-directive.ts",
    source: "// eslint-disable-next-line no-var\nexport const directiveValue = true;",
  },
  oxlintDisableDirective: {
    filePath: "lib/oxlint-disable-directive.ts",
    source: "// oxlint-disable-next-line no-var\nexport const directiveValue = true;",
  },
  magicStringComparison: {
    filePath: "lib/magic-string-comparison.ts",
    source: 'export function isArchived(status: string) {\n  return status === "archived";\n}',
  },
  lintedSourceControl: { filePath: "components/generated-like.tsx", source: GENERATED_SOURCE },
  openNextOutput: { filePath: ".open-next/cloudflare/init.js", source: GENERATED_SOURCE },
  cloudflareEntrypoint: { filePath: "cloudflare/worker.ts", source: GENERATED_SOURCE },
  agentWorktree: {
    filePath: ".claude/worktrees/review-copy/components/example.tsx",
    source: GENERATED_SOURCE,
  },
} as const;

let fixtureRoot: string;
let diagnosticsByFile: Map<string, string[]>;

/**
 * Copies the repository config next to the fixtures. Only the JS plugin specifiers change,
 * to absolute paths, because a temporary directory cannot resolve them on its own.
 */
function writeFixtureConfig(targetDirectory: string) {
  const config = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, OXLINT_CONFIG_FILE_NAME), "utf8"));
  const requireFromRepository = createRequire(path.join(REPOSITORY_ROOT, "package.json"));
  for (const override of config.overrides ?? []) {
    override.jsPlugins = override.jsPlugins?.map((pluginSpecifier: string) =>
      pluginSpecifier.startsWith(LOCAL_PLUGIN_PREFIX)
        ? path.join(REPOSITORY_ROOT, pluginSpecifier)
        : requireFromRepository.resolve(pluginSpecifier)
    );
  }
  writeFileSync(path.join(targetDirectory, OXLINT_CONFIG_FILE_NAME), JSON.stringify(config));
}

/** Runs the real oxlint binary once over every fixture and groups rule codes by file. */
function runOxlint(workingDirectory: string) {
  const requireFromRepository = createRequire(path.join(REPOSITORY_ROOT, "package.json"));
  const oxlintBinary = path.join(path.dirname(requireFromRepository.resolve("oxlint/package.json")), "bin", "oxlint");
  const filePaths = Object.values(FIXTURES).map((fixture) => fixture.filePath);
  const result = spawnSync(process.execPath, [oxlintBinary, "--format", "json", ...filePaths], {
    cwd: workingDirectory,
    encoding: "utf8",
  });
  if (result.error) {
    throw new Error(`oxlint-config test: failed to run ${oxlintBinary}`, { cause: result.error });
  }

  const { diagnostics } = JSON.parse(result.stdout) as { diagnostics: OxlintDiagnostic[] };
  const groupedDiagnostics = new Map<string, string[]>();
  for (const diagnostic of diagnostics) {
    const normalizedFilePath = diagnostic.filename.replaceAll("\\", "/");
    groupedDiagnostics.set(normalizedFilePath, [
      ...(groupedDiagnostics.get(normalizedFilePath) ?? []),
      diagnostic.code,
    ]);
  }
  return groupedDiagnostics;
}

/** Returns the rule codes oxlint reported for one fixture. */
function lintCodesFor(fixture: { filePath: string }) {
  return diagnosticsByFile.get(fixture.filePath) ?? [];
}

beforeAll(() => {
  fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "oxlint-config-"));
  for (const fixture of Object.values(FIXTURES)) {
    const absoluteFilePath = path.join(fixtureRoot, fixture.filePath);
    mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
    writeFileSync(absoluteFilePath, fixture.source);
  }
  writeFixtureConfig(fixtureRoot);
  diagnosticsByFile = runOxlint(fixtureRoot);
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("oxlint module boundaries", () => {
  it("rejects deprecated feature imports inside src/modules", () => {
    expect(lintCodesFor(FIXTURES.deprecatedFeatureImport)).toContain(RESTRICTED_IMPORTS_CODE);
  });

  it("rejects setup imports inside module layers", () => {
    expect(lintCodesFor(FIXTURES.moduleSetupImport)).toContain(RESTRICTED_IMPORTS_CODE);
  });

  it("rejects barrel setup imports inside module layers", () => {
    expect(lintCodesFor(FIXTURES.barrelSetupImport)).toContain(RESTRICTED_IMPORTS_CODE);
  });

  it("rejects relative setup imports inside module layers", () => {
    expect(lintCodesFor(FIXTURES.relativeSetupImport)).toContain(RESTRICTED_IMPORTS_CODE);
  });

  it("rejects relative setup imports from another module", () => {
    expect(lintCodesFor(FIXTURES.crossModuleSetupImport)).toContain(RESTRICTED_IMPORTS_CODE);
  });

  it("rejects SitePing widget imports inside the SitePing module", () => {
    expect(lintCodesFor(FIXTURES.sitepingWidgetImport)).toContain(RESTRICTED_IMPORTS_CODE);
  });
});

describe("oxlint JS plugins", () => {
  it("rejects eslint-disable directives in product code", () => {
    expect(lintCodesFor(FIXTURES.eslintDisableDirective)).toContain(LINT_DISABLE_CODE);
  });

  it("rejects oxlint-disable directives in product code", () => {
    expect(lintCodesFor(FIXTURES.oxlintDisableDirective)).toContain(LINT_DISABLE_CODE);
  });

  it("rejects magic strings used as comparison operands", () => {
    expect(lintCodesFor(FIXTURES.magicStringComparison)).toContain(MAGIC_STRINGS_CODE);
  });
});

describe("oxlint generated output boundaries", () => {
  it("reports the same source outside ignored paths", () => {
    expect(lintCodesFor(FIXTURES.lintedSourceControl)).toEqual(
      expect.arrayContaining([BAN_TS_COMMENT_CODE, UNUSED_VARS_CODE])
    );
  });

  it("ignores OpenNext Cloudflare generated output", () => {
    expect(lintCodesFor(FIXTURES.openNextOutput)).toEqual([]);
  });

  it("ignores the Cloudflare Workers entrypoint", () => {
    expect(lintCodesFor(FIXTURES.cloudflareEntrypoint)).toEqual([]);
  });

  it("ignores agent-generated worktrees", () => {
    expect(lintCodesFor(FIXTURES.agentWorktree)).toEqual([]);
  });
});
