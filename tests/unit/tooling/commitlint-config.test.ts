/** @vitest-environment node */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { spawnSync } from "node:child_process";

const COMMITLINT_BIN = path.join(
  process.cwd(),
  "node_modules",
  "@commitlint",
  "cli",
  "cli.js"
);
const COMMITLINT_CONFIG = path.join(process.cwd(), "commitlint.config.mjs");

function lintCommitMessage(message: string) {
  const result = spawnSync(
    process.execPath,
    [COMMITLINT_BIN, "--config", COMMITLINT_CONFIG],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      input: message,
    }
  );

  if (result.error) {
    throw result.error;
  }

  return result;
}

describe("commitlint config", () => {
  it.each([
    "fix: reject invalid SitePing feedback filters",
    "feat: Add SitePing feedback workflow",
    "ci: Move quality gate to GitHub Actions",
    "chore: Add Cloudflare Workers deployment target",
    "Avoid duplicate SitePing GitHub issues",
    "Handle concurrent SitePing duplicate submissions",
    "0.52.3",
  ])("accepts repository commit style: %s", (message) => {
    expect(lintCommitMessage(message).status).toBe(0);
  });

  it.each([
    "fix reject invalid SitePing feedback filters",
    "feat:",
    "ci: ",
    "0.52",
    "wip",
  ])("rejects ambiguous commit messages: %s", (message) => {
    const result = lintCommitMessage(message);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("repository commit style");
  });
});
