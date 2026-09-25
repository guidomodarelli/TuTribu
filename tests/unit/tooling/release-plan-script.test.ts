/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import {
  MIGRATION_STATUS,
  PULL_REQUEST_STATE,
  RELEASE_STEP,
  buildReleasePlan,
  bumpReleaseVersion,
  findUnpushedRelease,
  listNextVersions,
  parseReleaseArguments,
  resolveRequestedVersion,
  suggestReleaseType,
} from "../../../scripts/release/release-plan.mjs";

type ReleaseState = Parameters<typeof buildReleasePlan>[0];

const UP_TO_DATE_MIGRATIONS = {
  status: MIGRATION_STATUS.upToDate,
  pending: [],
  databaseHost: "db.example.test",
  reason: null,
};

function createMainState(overrides: Partial<ReleaseState> = {}): ReleaseState {
  return {
    currentBranch: "main",
    workingTreeChanges: [],
    branch: null,
    pullRequest: null,
    githubError: null,
    main: { aheadCommits: [], behindCount: 0 },
    unpushedRelease: null,
    unreleasedCommits: [{ subject: "Add event reminders (#75)" }],
    migrations: UP_TO_DATE_MIGRATIONS,
    ...overrides,
  };
}

function stepIds(state: ReleaseState): string[] {
  return buildReleasePlan(state).steps.map((planStep) => planStep.id);
}

describe("release plan", () => {
  it("should bump each semver part and reset the lower ones", () => {
    expect(bumpReleaseVersion("0.93.4", "patch")).toBe("0.93.5");
    expect(bumpReleaseVersion("0.93.4", "minor")).toBe("0.94.0");
    expect(bumpReleaseVersion("0.93.4", "major")).toBe("1.0.0");
  });

  it("should offer only the next patch, minor and major versions", () => {
    expect(listNextVersions("0.93.0").map((candidate) => candidate.version)).toEqual([
      "0.93.1",
      "0.94.0",
      "1.0.0",
    ]);
  });

  it("should accept --set-version only when it is the next patch, minor or major", () => {
    expect(resolveRequestedVersion("0.93.0", { bump: null, setVersion: "0.94.0" })).toEqual({
      releaseType: "minor",
      version: "0.94.0",
    });
    expect(() => resolveRequestedVersion("0.93.0", { bump: null, setVersion: "0.95.0" })).toThrow(
      /no saltear versiones/
    );
    expect(() => resolveRequestedVersion("0.93.0", { bump: null, setVersion: "0.93.2" })).toThrow(
      /Opciones: 0\.93\.1, 0\.94\.0, 1\.0\.0/
    );
    expect(() => resolveRequestedVersion("0.93.0", { bump: null, setVersion: "0.93.0" })).toThrow();
    expect(() => resolveRequestedVersion("0.93.0", { bump: null, setVersion: "0.92.0" })).toThrow();
    expect(() => resolveRequestedVersion("0.93.0", { bump: null, setVersion: "1.x" })).toThrow(
      /formato X\.Y\.Z/
    );
  });

  it("should resolve --bump and leave the version to the prompt when no flag is given", () => {
    expect(resolveRequestedVersion("0.93.0", { bump: "patch", setVersion: null })?.version).toBe("0.93.1");
    expect(resolveRequestedVersion("0.93.0", { bump: null, setVersion: null })).toBeNull();
  });

  it("should parse the command-line flags in both spaced and inline forms", () => {
    expect(parseReleaseArguments(["--bump", "minor", "--dry-run"])).toEqual({
      bump: "minor",
      setVersion: null,
      dryRun: true,
      help: false,
    });
    expect(parseReleaseArguments(["--set-version=v1.0.0"]).setVersion).toBe("1.0.0");
    expect(() => parseReleaseArguments(["--bump", "huge"])).toThrow(/--bump espera/);
    expect(() => parseReleaseArguments(["--bump", "patch", "--set-version", "0.93.1"])).toThrow(
      /no los dos a la vez/
    );
    expect(() => parseReleaseArguments(["--force"])).toThrow(/Opción desconocida/);
  });

  it("should suggest the release type from the shipped commits", () => {
    expect(suggestReleaseType([{ subject: "fix: handle empty feed" }, { subject: "chore: bump deps" }]).releaseType).toBe(
      "patch"
    );
    expect(suggestReleaseType([{ subject: "fix: typo" }, { subject: "feat(events): waitlist" }]).releaseType).toBe(
      "minor"
    );
    expect(suggestReleaseType([{ subject: "Add personal webcal feed (#74)" }]).releaseType).toBe("minor");
    expect(suggestReleaseType([{ subject: "refactor!: drop legacy routes" }]).releaseType).toBe("major");
    expect(
      suggestReleaseType([{ subject: "feat: new auth", body: "BREAKING CHANGE: sessions reset" }]).releaseType
    ).toBe("major");
  });

  it("should detect a release commit created locally but never pushed", () => {
    expect(
      findUnpushedRelease({ localMainAheadCommits: [{ subject: "0.94.0" }], localMainVersion: "0.94.0" })
    ).toEqual({ version: "0.94.0", tag: "v0.94.0" });
    expect(findUnpushedRelease({ localMainAheadCommits: [], localMainVersion: "0.93.0" })).toBeNull();
    expect(
      findUnpushedRelease({ localMainAheadCommits: [{ subject: "fix: local hack" }], localMainVersion: "0.93.0" })
    ).toBeNull();
  });

  it("should bump and push when main is clean and has unreleased commits", () => {
    expect(stepIds(createMainState())).toEqual([RELEASE_STEP.bumpVersion, RELEASE_STEP.pushRelease]);
  });

  it("should update main and apply pending migrations before bumping", () => {
    const state = createMainState({
      main: { aheadCommits: [], behindCount: 2 },
      migrations: { ...UP_TO_DATE_MIGRATIONS, status: MIGRATION_STATUS.pending, pending: ["20260927_add_x"] },
    });

    expect(stepIds(state)).toEqual([
      RELEASE_STEP.syncMain,
      RELEASE_STEP.applyMigrations,
      RELEASE_STEP.bumpVersion,
      RELEASE_STEP.pushRelease,
    ]);
  });

  it("should plan nothing when everything is already released", () => {
    const plan = buildReleasePlan(createMainState({ unreleasedCommits: [] }));

    expect(plan.steps).toEqual([]);
    expect(plan.blockers).toEqual([]);
  });

  it("should warn without blocking when migrations cannot be verified", () => {
    const plan = buildReleasePlan(
      createMainState({ migrations: { ...UP_TO_DATE_MIGRATIONS, status: MIGRATION_STATUS.unknown, reason: "sin red" } })
    );

    expect(plan.blockers).toEqual([]);
    expect(plan.warnings).toEqual([expect.stringContaining("sin red")]);
  });

  it("should only resume the push of a release left half published", () => {
    const state = createMainState({
      main: { aheadCommits: [{ subject: "0.94.0" }], behindCount: 0 },
      unpushedRelease: { version: "0.94.0", tag: "v0.94.0" },
    });

    expect(stepIds(state)).toEqual([RELEASE_STEP.pushRelease]);
  });

  it("should block uncommitted changes and foreign commits on main", () => {
    const plan = buildReleasePlan(
      createMainState({
        workingTreeChanges: [" M package.json"],
        main: { aheadCommits: [{ subject: "fix: local hack" }], behindCount: 0 },
      })
    );

    expect(plan.steps).toEqual([]);
    expect(plan.blockers.map((blocker) => blocker.title)).toEqual([
      expect.stringContaining("sin commitear"),
      expect.stringContaining("no están en origin"),
    ]);
  });

  it("should block a feature branch and explain what is missing to reach main", () => {
    const plan = buildReleasePlan(
      createMainState({
        currentBranch: "feature/waitlist",
        branch: { name: "feature/waitlist", headSha: "abc", hasUpstream: true, unpushedCount: 2, aheadOfMainCount: 3 },
        pullRequest: {
          number: 81,
          url: "https://github.com/acme/app/pull/81",
          state: PULL_REQUEST_STATE.open,
          isDraft: true,
          headRefOid: "old",
        },
      })
    );

    expect(plan.steps).toEqual([]);
    expect(plan.blockers[0].title).toContain("feature/waitlist");
    expect(plan.blockers[0].details).toEqual([
      "2 commit(s) sin subir: git push.",
      "Falta mergear el PR #81 (está en borrador): https://github.com/acme/app/pull/81",
      "Después hacé git switch main y corré pnpm release.",
    ]);
  });

  it("should tell a merged feature branch to switch back to main", () => {
    const plan = buildReleasePlan(
      createMainState({
        currentBranch: "feature/waitlist",
        branch: { name: "feature/waitlist", headSha: "abc", hasUpstream: false, unpushedCount: 0, aheadOfMainCount: 1 },
        pullRequest: {
          number: 81,
          url: "https://github.com/acme/app/pull/81",
          state: PULL_REQUEST_STATE.merged,
          isDraft: false,
          headRefOid: "abc",
        },
      })
    );

    expect(plan.blockers[0].details).toEqual(["El PR #81 ya está mergeado: hacé git switch main."]);
  });
});
