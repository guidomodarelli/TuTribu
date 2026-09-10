import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("AGENTS performance guardrails", () => {
  it("requires incremental responses before full route refreshes for interactive mutations", () => {
    const agentsInstructions = readFileSync(
      join(process.cwd(), "AGENTS.md"),
      "utf8"
    );

    expect(agentsInstructions).toContain(
      "Interactive mutations must prefer incremental responses over full route refreshes"
    );
    expect(agentsInstructions).toContain(
      "Tests for user-triggered mutations must assert that the interaction does not trigger a full route refresh"
    );
    expect(agentsInstructions).toContain(
      "A full refresh after a mutation is allowed only when it is explicitly justified"
    );
  });
});
