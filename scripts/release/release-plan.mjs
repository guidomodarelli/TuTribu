/**
 * Pure release planning for `pnpm create-version`.
 *
 * Receives the repository snapshot gathered by `release-state.mjs` and
 * decides, without touching Git or the database, what is still missing to
 * ship a release from `main`: update `main`, apply pending migrations, bump
 * the version (commit + annotated tag) and push both. Anything that must not
 * be automated (a feature branch, uncommitted changes, foreign commits on
 * `main`) becomes a blocker that explains what to do. Keeping the decision
 * pure makes every combination testable and lets the orchestrator resume an
 * interrupted release just by running the same command again.
 *
 * @module release-plan
 */

import { CHANGE_TYPES, RELEASE_TYPE, UNRELEASED_HEADING } from "beez-rp/constants";
import { isReleaseCommitSubject, toReleaseTag } from "beez-rp/versions";

/**
 * @typedef {{ sha?: string, subject: string, body?: string }} ReleaseCommit
 * @typedef {{ name: string, headSha: string, hasUpstream: boolean, unpushedCount: number, aheadOfMainCount: number }} FeatureBranchSnapshot
 * @typedef {{ number: number, url: string, title?: string, state: string, isDraft: boolean, headRefOid: string }} PullRequestSnapshot
 * @typedef {{ status: string, pending: string[], databaseHost: string | null, reason: string | null }} MigrationSnapshot
 * @typedef {{ version: string, tag: string }} UnpushedRelease
 * @typedef {{
 *   currentBranch: string | null,
 *   workingTreeChanges: string[],
 *   branch: FeatureBranchSnapshot | null,
 *   pullRequest: PullRequestSnapshot | null,
 *   githubError: string | null,
 *   main: { aheadCommits: ReleaseCommit[], behindCount: number },
 *   lastRelease?: { sha: string, version: string } | null,
 *   releasedVersion?: string | null,
 *   localMainVersion?: string | null,
 *   unpushedRelease: UnpushedRelease | null,
 *   unreleasedCommits: ReleaseCommit[],
 *   migrations: MigrationSnapshot,
 *   changelog: { exists: boolean, entryCount: number, unknownSections: string[] },
 * }} ReleaseState
 * @typedef {{ id: string, title: string, detail: string | undefined }} ReleasePlanStep
 * @typedef {{ title: string, details: string[] }} ReleaseBlocker
 * @typedef {{ steps: ReleasePlanStep[], blockers: ReleaseBlocker[], warnings: string[] }} ReleasePlan
 */

/** Changelog that travels in the release commit, so it may be uncommitted on `main`. */
const CHANGELOG_FILE = "CHANGELOG.md";

/** Width of the `git status --porcelain` state columns before each path. */
const PORCELAIN_STATUS_WIDTH = 3;

/** Branch that receives releases; Vercel deploys it. */
export const MAIN_BRANCH = "main";

/** What each release type means for TuTribu users, shown under each version option. */
export const RELEASE_TYPE_DESCRIPTION = {
  patch: "Solo arreglos o cambios internos; nada nuevo para quien usa la app.",
  minor: "Funcionalidades o mejoras nuevas; lo existente sigue funcionando igual.",
  major: "Cambio grande o incompatible: flujos, datos o comportamiento que cambian para los usuarios.",
};

/** Stable identifiers of every step the orchestrator knows how to run. */
export const RELEASE_STEP = {
  syncMain: "sync-main",
  generateChangelog: "generate-changelog",
  applyMigrations: "apply-migrations",
  bumpVersion: "bump-version",
  pushRelease: "push-release",
};

/** Pull request states reported by `gh pr view --json state`. */
export const PULL_REQUEST_STATE = {
  open: "OPEN",
  merged: "MERGED",
  closed: "CLOSED",
};

/** Result of checking the database for migrations missing in production. */
export const MIGRATION_STATUS = {
  upToDate: "up-to-date",
  pending: "pending",
  unknown: "unknown",
};

/** Usage printed by `pnpm create-version --help`. */
export const RELEASE_USAGE = [
  "Uso: pnpm create-version [opciones]",
  "",
  "  --bump patch|minor|major   Elige el tipo de versión sin preguntar.",
  "  --set-version X.Y.Z        Fija la versión exacta (solo el siguiente patch, minor o major).",
  "  --dry-run                  Diagnostica y muestra el plan sin cambiar nada.",
  "  --help                     Muestra esta ayuda.",
];

/**
 * Parses the command-line arguments of `pnpm create-version`.
 *
 * @param {string[]} argv - Arguments after the script path.
 * @returns {{ bump: import("beez-rp/versions").ReleaseType | null, setVersion: string | null, dryRun: boolean, help: boolean }} Options.
 * @throws {Error} With a Spanish message when an argument is unknown or invalid.
 */
export function parseReleaseArguments(argv) {
  const options = { bump: null, setVersion: null, dryRun: false, help: false };
  const releaseTypes = Object.values(RELEASE_TYPE);

  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inlineValue] = argv[index].split("=", 2);
    const readValue = () => inlineValue ?? argv[++index];

    switch (flag) {
      case "--bump": {
        const value = readValue();
        if (!releaseTypes.includes(value)) {
          throw new Error(`--bump espera ${releaseTypes.join("|")} y recibió "${value ?? ""}".`);
        }
        options.bump = value;
        break;
      }
      case "--set-version": {
        const value = readValue();
        if (!value) {
          throw new Error("--set-version necesita una versión X.Y.Z.");
        }
        options.setVersion = value.replace(/^v/, "");
        break;
      }
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--":
        break;
      default:
        throw new Error(`Opción desconocida: ${argv[index]}. Usá --help para ver las opciones.`);
    }
  }

  if (options.bump && options.setVersion) {
    throw new Error("Usá --bump o --set-version, no los dos a la vez.");
  }

  return options;
}

/**
 * Detects a release commit created locally but never pushed (for example,
 * when a previous run failed during the push): local `main` is ahead of
 * `origin/main` only by version commits and its `package.json` carries the
 * version of the last one.
 *
 * @param {{ localMainAheadCommits: { subject: string }[], localMainVersion: string | null }} snapshot - Local `main` compared with `origin`.
 * @returns {{ version: string, tag: string } | null} Release waiting to be pushed.
 */
export function findUnpushedRelease({ localMainAheadCommits, localMainVersion }) {
  const [newestCommit] = localMainAheadCommits;
  const onlyReleaseCommitsAhead =
    localMainAheadCommits.length > 0 &&
    localMainAheadCommits.every((commit) => isReleaseCommitSubject(commit.subject));

  if (!localMainVersion || !onlyReleaseCommitsAhead || newestCommit.subject.trim() !== localMainVersion) {
    return null;
  }

  return { version: localMainVersion, tag: toReleaseTag(localMainVersion) };
}

/**
 * Describes what is still missing for a feature branch to reach `main`, so
 * the blocker tells the user the next concrete action.
 *
 * @param {FeatureBranchSnapshot} branch - Branch snapshot.
 * @param {PullRequestSnapshot | null} pullRequest - Pull request of the branch.
 * @param {string | null} githubError - Why the pull request could not be read.
 * @returns {string[]} Spanish lines, most urgent first.
 */
export function describeFeatureBranchGaps(branch, pullRequest, githubError) {
  if (pullRequest?.state === PULL_REQUEST_STATE.merged && branch.headSha === pullRequest.headRefOid) {
    return [`El PR #${pullRequest.number} ya está mergeado: hacé git switch ${MAIN_BRANCH}.`];
  }

  if (branch.aheadOfMainCount === 0) {
    return [`La rama no tiene commits nuevos respecto de ${MAIN_BRANCH}: hacé git switch ${MAIN_BRANCH}.`];
  }

  const gaps = [];

  if (!branch.hasUpstream) {
    gaps.push(`La rama nunca se subió: git push -u origin ${branch.name}.`);
  } else if (branch.unpushedCount > 0) {
    gaps.push(`${branch.unpushedCount} commit(s) sin subir: git push.`);
  }

  if (githubError) {
    gaps.push(`No se pudo consultar el PR (${githubError}).`);
  } else if (pullRequest?.state === PULL_REQUEST_STATE.merged) {
    gaps.push(`El PR #${pullRequest.number} ya se mergeó, pero la rama tiene commits posteriores: abrí un PR nuevo.`);
  } else if (pullRequest?.state === PULL_REQUEST_STATE.open) {
    const draftNote = pullRequest.isDraft ? " (está en borrador)" : "";
    gaps.push(`Falta mergear el PR #${pullRequest.number}${draftNote}: ${pullRequest.url}`);
  } else {
    gaps.push(`Falta abrir el PR contra ${MAIN_BRANCH}: gh pr create --fill.`);
  }

  gaps.push(`Después hacé git switch ${MAIN_BRANCH} y corré pnpm create-version.`);

  return gaps;
}

/**
 * Creates a plan step.
 *
 * @param {string} id - One of {@link RELEASE_STEP}.
 * @param {string} title - Spanish title shown to the user.
 * @param {string} [detail] - Optional Spanish detail line.
 * @returns {ReleasePlanStep} Step.
 */
function step(id, title, detail) {
  return { id, title, detail };
}

/**
 * Decides which steps are still missing to publish a release from `main`.
 *
 * @param {ReleaseState} state - Snapshot gathered by `release-state.mjs`.
 * @returns {ReleasePlan} Ordered plan.
 */
export function buildReleasePlan(state) {
  /** @type {ReleasePlan} */
  const plan = { steps: [], blockers: [], warnings: [] };

  if (!state.currentBranch) {
    plan.blockers.push({
      title: "HEAD está desacoplado (detached)",
      details: [`Hacé git switch ${MAIN_BRANCH} y volvé a correr pnpm create-version.`],
    });
    return plan;
  }

  if (state.currentBranch !== MAIN_BRANCH) {
    plan.blockers.push({
      title: `Estás en ${state.currentBranch}: los releases salen solo desde ${MAIN_BRANCH}`,
      details: state.branch
        ? describeFeatureBranchGaps(state.branch, state.pullRequest, state.githubError)
        : [`Hacé git switch ${MAIN_BRANCH} y volvé a correr pnpm create-version.`],
    });
  }

  const onlyChangelogChanged =
    state.workingTreeChanges.length > 0 &&
    state.workingTreeChanges.every((line) => line.slice(PORCELAIN_STATUS_WIDTH) === CHANGELOG_FILE);

  if (state.workingTreeChanges.length > 0 && !onlyChangelogChanged) {
    plan.blockers.push({
      title: `Hay ${state.workingTreeChanges.length} archivo(s) sin commitear`,
      details: [
        ...state.workingTreeChanges.slice(0, 5),
        "Commitealos en una rama (o git stash) y volvé a correr pnpm create-version.",
      ],
    });
  }

  if (state.main.aheadCommits.length > 0 && !state.unpushedRelease) {
    plan.blockers.push({
      title: `${MAIN_BRANCH} local tiene ${state.main.aheadCommits.length} commit(s) que no están en origin`,
      details: [
        ...state.main.aheadCommits.slice(0, 5).map((commit) => `· ${commit.subject}`),
        `Movelos a una rama (git switch -c <rama>) y llevalos por un PR.`,
      ],
    });
  }

  if (plan.blockers.length > 0) {
    return plan;
  }

  if (state.unpushedRelease) {
    plan.steps.push(
      step(RELEASE_STEP.pushRelease, `Subir el release ${state.unpushedRelease.tag} que quedó pendiente`, "Dispara el deploy en Vercel.")
    );
    return plan;
  }

  if (state.main.behindCount > 0) {
    plan.steps.push(
      step(RELEASE_STEP.syncMain, `Actualizar ${MAIN_BRANCH} desde origin`, `${state.main.behindCount} commit(s) nuevos.`)
    );
  }

  if (state.migrations.status === MIGRATION_STATUS.pending) {
    plan.steps.push(
      step(
        RELEASE_STEP.applyMigrations,
        `Aplicar ${state.migrations.pending.length} migración(es) en la base de datos`,
        `Destino: ${state.migrations.databaseHost ?? "desconocido"} · se pide confirmación antes.`
      )
    );
  } else if (state.migrations.status === MIGRATION_STATUS.unknown) {
    plan.warnings.push(`No se pudo verificar si hay migraciones pendientes: ${state.migrations.reason}.`);
  }

  if (state.unreleasedCommits.length > 0) {
    if (state.changelog.unknownSections.length > 0) {
      plan.steps = [];
      plan.blockers.push({
        title: `CHANGELOG.md ${UNRELEASED_HEADING} usa secciones no válidas: ${state.changelog.unknownSections.join(", ")}`,
        details: [`Usá solo ${CHANGE_TYPES.map((type) => `### ${type}`).join(", ")} y volvé a correr pnpm create-version.`],
      });
      return plan;
    }

    if (state.changelog.entryCount === 0) {
      plan.steps.push(
        step(
          RELEASE_STEP.generateChangelog,
          `Completar ${UNRELEASED_HEADING} del CHANGELOG con Codex`,
          "Está vacío: Codex lo arma desde los commits sin publicar. Si no puede, el release se corta."
        )
      );
    }

    plan.steps.push(
      step(
        RELEASE_STEP.bumpVersion,
        "Elegir la nueva versión y crear commit + tag",
        `${UNRELEASED_HEADING} pasa a esa versión con la fecha de hoy y se commitea junto con package.json.`
      ),
      step(RELEASE_STEP.pushRelease, `Subir ${MAIN_BRANCH} y el tag a origin`, "Dispara el deploy en Vercel.")
    );
  }

  return plan;
}
