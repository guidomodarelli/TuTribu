/** @jest-environment node */

type StopQualityGateScript = {
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
        "docs/architecture/subscriptions.md",
      ])
    ).toBe(false);
  });

  it("should run for TypeScript, React, and test changes", () => {
    expect(
      stopQualityGateScript.shouldRunQualityGateForChangedFiles([
        "docs/architecture/subscriptions.md",
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

  it("should parse modified and renamed files from git porcelain output", () => {
    expect(
      stopQualityGateScript.parseChangedFilePaths(
        [
          " M docs/user-manual/subscription-pricing-management.htm",
          "A  src/modules/subscriptions/domain/entities/subscription.ts",
          "R  docs/old.md -> tests/unit/modules/subscriptions/domain/subscription.test.ts",
        ].join("\n")
      )
    ).toEqual([
      "docs/user-manual/subscription-pricing-management.htm",
      "src/modules/subscriptions/domain/entities/subscription.ts",
      "docs/old.md",
      "tests/unit/modules/subscriptions/domain/subscription.test.ts",
    ]);
  });
});
