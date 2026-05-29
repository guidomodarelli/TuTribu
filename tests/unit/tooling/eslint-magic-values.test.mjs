/** @jest-environment node */

import path from "node:path";
import { spawnSync } from "node:child_process";

const MAGIC_STRINGS_RULE_ID = "no-magic/no-magic-strings";
const MAGIC_NUMBERS_RULE_ID = "@typescript-eslint/no-magic-numbers";
const NO_ESLINT_DISABLE_RULE_ID = "no-eslint-disable/no-eslint-disable";

const PRODUCT_FILE_PATH = "src/modules/example/application/example.ts";

/**
 * Lints a snippet through the project's real flat config (eslint.config.mjs) by
 * spawning the eslint binary, exercising the published-style wiring of
 * eslint-plugin-no-magic together with @typescript-eslint/no-magic-numbers.
 * A child process is required because eslint loads the flat config via dynamic
 * import, which Jest cannot perform in-process without VM module flags.
 */
function lintProductSnippet(code, filePath = PRODUCT_FILE_PATH) {
  const eslintBin = path.join(process.cwd(), "node_modules", "eslint", "bin", "eslint.js");
  const result = spawnSync(
    process.execPath,
    [eslintBin, "--stdin", "--stdin-filename", filePath, "--format", "json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      input: code,
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

  const [lintResult] = JSON.parse(result.stdout);

  return (lintResult?.messages ?? []).map((message) => message.ruleId);
}

describe("magic values lint wiring", () => {
  it("flags magic strings used in domain comparisons through no-magic", () => {
    const ruleIds = lintProductSnippet(
      `export function resolveAccess(status: string) {
        return status === "hidden";
      }`
    );

    expect(ruleIds).toContain(MAGIC_STRINGS_RULE_ID);
  });

  it("flags magic strings passed to behavioral sinks through no-magic", () => {
    const ruleIds = lintProductSnippet(
      `export function persistSession(token: string) {
        localStorage.setItem("auth.token", token);
      }`
    );

    expect(ruleIds).toContain(MAGIC_STRINGS_RULE_ID);
  });

  it("flags magic numbers through @typescript-eslint/no-magic-numbers", () => {
    const ruleIds = lintProductSnippet(
      `export function waitForRetry(run: () => void) {
        setTimeout(run, 3000);
      }`
    );

    expect(ruleIds).toContain(MAGIC_NUMBERS_RULE_ID);
  });

  it("does not flag the in operator key or the -1/0/1 numbers", () => {
    const ruleIds = lintProductSnippet(
      `export function normalize(payload: object, index: number) {
        const hasStatus = "status" in payload;
        const next = index === -1 ? 0 : 1;
        return { hasStatus, next };
      }`
    );

    expect(ruleIds).not.toContain(MAGIC_STRINGS_RULE_ID);
    expect(ruleIds).not.toContain(MAGIC_NUMBERS_RULE_ID);
  });

  it("keeps banning eslint-disable directives in product code", () => {
    const ruleIds = lintProductSnippet(
      `export function waitForRetry(run: () => void) {
        // eslint-disable-next-line no-magic/no-magic-strings
        run();
      }`
    );

    expect(ruleIds).toContain(NO_ESLINT_DISABLE_RULE_ID);
  });

  it("does not apply the product magic rules to test files", () => {
    const ruleIds = lintProductSnippet(
      `describe("example", () => {
        it("keeps literals available in tests", () => {
          expect(3000).toBe(3000);
          expect("hidden").toBe("hidden");
        });
      });`,
      "tests/unit/example.test.ts"
    );

    expect(ruleIds).not.toContain(MAGIC_STRINGS_RULE_ID);
    expect(ruleIds).not.toContain(MAGIC_NUMBERS_RULE_ID);
  });
});
