/** @jest-environment node */

type StopQualityGateScript = {
  getQualityGateScriptsForChangedFiles: (changedFilePaths: string[]) => string[];
  parseChangedFilePaths: (gitStatusOutput: string) => string[];
  shouldRunQualityGateForChangedFiles: (changedFilePaths: string[]) => boolean;
};

let stopQualityGateScript: StopQualityGateScript;

describe("stop quality gate script", () => {
  beforeAll(async () => {
    const importedModule = await import("../../../.agents/hooks/stop-quality-gate.js");

    stopQualityGateScript = (importedModule.default ?? importedModule) as StopQualityGateScript;
  });

  it("should skip documentation-only changes", () => {
    expect(
      stopQualityGateScript.shouldRunQualityGateForChangedFiles([
        "README.md",
        "docs/user-manual/subscription-pricing-management.htm",
        "docs/architecture/subscriptions.htm",
      ])
    ).toBe(false);
  });

  it("should run for TypeScript, React, and test changes", () => {
    expect(
      stopQualityGateScript.shouldRunQualityGateForChangedFiles([
        "docs/architecture/subscriptions.htm",
        "src/modules/subscriptions/application/use-cases/manage-prices.ts",
      ])
    ).toBe(true);

    expect(
      stopQualityGateScript.shouldRunQualityGateForChangedFiles([
        "components/tribes/price-card/index.tsx",
      ])
    ).toBe(true);

    expect(
      stopQualityGateScript.shouldRunQualityGateForChangedFiles([
        "tests/unit/modules/subscriptions/application/manage-prices.test.ts",
      ])
    ).toBe(true);
  });

  it("should run for tooling and package changes that can affect validation", () => {
    expect(
      stopQualityGateScript.shouldRunQualityGateForChangedFiles([
        "package.json",
      ])
    ).toBe(true);

    expect(
      stopQualityGateScript.shouldRunQualityGateForChangedFiles([
        ".agents/hooks/stop-quality-gate.js",
      ])
    ).toBe(true);

    expect(
      stopQualityGateScript.shouldRunQualityGateForChangedFiles([
        ".codex/hooks.json",
      ])
    ).toBe(true);
  });

  it("should skip build for test-only changes", () => {
    expect(
      stopQualityGateScript.getQualityGateScriptsForChangedFiles([
        "docs/architecture/subscriptions.htm",
        "tests/unit/modules/subscriptions/application/manage-prices.test.ts",
        "tests/unit/modules/subscriptions/infrastructure/mapper.spec.ts",
      ])
    ).toEqual(["typecheck", "lint", "test"]);
  });

  it("should run the full gate when product code changes alongside tests", () => {
    expect(
      stopQualityGateScript.getQualityGateScriptsForChangedFiles([
        "src/modules/subscriptions/application/use-cases/manage-prices.ts",
        "tests/unit/modules/subscriptions/application/manage-prices.test.ts",
      ])
    ).toEqual(["typecheck", "lint", "test"]);
  });

  it("should parse modified and renamed files from git porcelain output", () => {
    expect(
      stopQualityGateScript.parseChangedFilePaths(
        [
          " M docs/user-manual/subscription-pricing-management.htm",
          "A  src/modules/subscriptions/domain/entities/subscription.ts",
          "R  docs/old.htm -> tests/unit/modules/subscriptions/domain/subscription.test.ts",
        ].join("\n")
      )
    ).toEqual([
      "docs/user-manual/subscription-pricing-management.htm",
      "src/modules/subscriptions/domain/entities/subscription.ts",
      "docs/old.htm",
      "tests/unit/modules/subscriptions/domain/subscription.test.ts",
    ]);
  });
});
