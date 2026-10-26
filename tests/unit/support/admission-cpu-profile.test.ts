/** @vitest-environment node */
/** Exercises owned CPU sample accounting and removal of raw debugger fields. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Profiler } from "node:inspector";
import { projectAdmissionCpuProfile } from "@/tests/support/admission-cpu-profile";

/** @returns A deterministic provider profile with nested application calls and an idle sample. */
function profile(): Profiler.Profile {
  return { startTime: 1000, endTime: 7000, nodes: [
    { id: 1, callFrame: { functionName: "(root)", scriptId: "0", url: "", lineNumber: -1, columnNumber: -1 }, children: [2, 4] },
    { id: 2, callFrame: { functionName: "execute", scriptId: "1", url: "file:///private/index.mjs", lineNumber: 4, columnNumber: 2 }, children: [3] },
    { id: 3, callFrame: { functionName: "buildQueryFromSourceParams", scriptId: "1", url: "file:///private/index.mjs", lineNumber: 8, columnNumber: 3 } },
    { id: 4, callFrame: { functionName: "(idle)", scriptId: "0", url: "", lineNumber: -1, columnNumber: -1 } },
  ], samples: [3, 3, 2, 4], timeDeltas: [1000, 2000, 1000, 2000] };
}

describe("admission CPU profile projection", () => {
  it("should separate leaf and inclusive time without treating the parent as another independent sample", () => {
    const result = projectAdmissionCpuProfile(profile());
    expect(result).toMatchObject({ status: "available", durationMs: 6, sampledMs: 6, sampleCount: 4, idleMs: 2, garbageCollectionMs: 0 });
    expect(result.topSelf.find((entry) => entry.name === "buildQueryFromSourceParams")).toMatchObject({ selfMs: 3, inclusiveMs: 3, samples: 2, source: "application_bundle" });
    expect(result.topInclusive.find((entry) => entry.name === "execute")).toMatchObject({ selfMs: 1, inclusiveMs: 4, samples: 1 });
  });
  it("should discard URLs, script ids, unsafe names and arbitrary provider fields", () => {
    const privateMarker = randomUUID(), original = profile();
    original.nodes[2].callFrame.functionName = `private-${privateMarker}@example.test`;
    original.nodes[2].callFrame.url = `file:///private/${privateMarker}/index.mjs`;
    original.nodes[2].callFrame.scriptId = privateMarker;
    const result = projectAdmissionCpuProfile({ ...original, credential: privateMarker } as Profiler.Profile);
    expect(JSON.stringify(result)).not.toContain(privateMarker);
    expect(JSON.stringify(result)).not.toContain("file://");
    expect(result.topSelf.some((entry) => entry.name === "anonymous")).toBe(true);
  });
  it("should account for native garbage collection and missing sample attribution explicitly", () => {
    const original = profile(); original.nodes[3].callFrame.functionName = "(garbage collector)";
    original.samples = [4, 999]; original.timeDeltas = [2000, 1000];
    expect(projectAdmissionCpuProfile(original)).toMatchObject({ garbageCollectionMs: 2, unattributedMs: 1, sampledMs: 3, sampleCount: 2 });
  });
  it.each(["negative_delta", "cyclic_nodes", "mismatched_samples"])("should fail safely for %s", (reason) => {
    const original = profile();
    if (reason === "negative_delta") original.timeDeltas = [-1, 1, 1, 1];
    if (reason === "cyclic_nodes") original.nodes[2].children = [1];
    if (reason === "mismatched_samples") original.timeDeltas = [];
    expect(() => projectAdmissionCpuProfile(original)).toThrow("AdmissionCpuProfile.project failed: invalid_profile");
  });
});
