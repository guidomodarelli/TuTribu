#!/usr/bin/env node
/**
 * `pnpm create-version`: one command that diagnoses the repository, shows what is
 * still missing and ships the release from `main`.
 *
 * 1. Diagnosis: fetches `origin`, reads the branch, working tree, `main`
 *    versus `origin/main`, the last `vX.Y.Z` tag, unreleased commits, a
 *    release left half pushed and the migrations pending in the database.
 * 2. Plan: `release-plan.mjs` turns that snapshot into ordered steps, or into
 *    blockers that explain what to fix (feature branch, uncommitted changes,
 *    foreign commits on `main`).
 * 3. Execution: updates `main`, applies pending migrations after an explicit
 *    confirmation, asks for the version (or takes `--bump` /
 *    `--set-version`), creates the `X.Y.Z` commit and the annotated
 *    `vX.Y.Z` tag, and pushes both. The Husky pre-push gate skips `main` and
 *    tags (it already ran on the merged branch), and the version change makes
 *    Vercel build and deploy.
 *
 * Every step is derived from the current state, so running the command again
 * after a failure resumes from the first missing step.
 *
 * @module release
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CODEX_NOT_FOUND_EXIT_CODE, buildChangelogPrompt, runCodex } from "./release/changelog-ai.mjs";
import { CHANGE_TYPES, UNRELEASED_HEADING, readUnreleased, releaseUnreleased } from "./release/changelog.mjs";
import { checkPendingMigrations } from "./release/pending-migrations.mjs";
import {
  MAIN_BRANCH,
  MIGRATION_STATUS,
  RELEASE_STEP,
  RELEASE_TYPE_DESCRIPTION,
  RELEASE_USAGE,
  buildReleasePlan,
  listNextVersions,
  parseReleaseArguments,
  resolveRequestedVersion,
  suggestReleaseType,
  toReleaseTag,
} from "./release/release-plan.mjs";
import {
  RELEASE_REMOTE,
  REMOTE_MAIN_REF,
  collectReleaseState,
  createGitReader,
  listCommits,
  readMigrationJournalAt,
  readPackageVersionAt,
  runInherited,
} from "./release/release-state.mjs";
import {
  BOX_TONE,
  ICON,
  confirm,
  formatDuration,
  measureActiveMs,
  paint,
  print,
  renderBanner,
  renderBox,
  renderRow,
  renderStepHeader,
  select,
  startSpinner,
} from "./release/terminal-ui.mjs";

/** Repository root, resolved from this file so the command works from any folder. */
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Script that runs `drizzle-kit migrate`, shared with `pnpm run db:migrate`. */
const MIGRATION_SCRIPT_PATH = path.join(REPOSITORY_ROOT, "scripts", "push-migrations.js");

/** Pinned Node.js version, compared with the running one. */
const PINNED_NODE_VERSION_PATH = path.join(REPOSITORY_ROOT, ".nvmrc");

/** Product name shown in the banner. */
const PROJECT_NAME = "TuTribu";

/** Maximum commits listed in the release notes box. */
const MAX_LISTED_COMMITS = 12;

/** Maximum pending migrations listed before summarizing the rest. */
const MAX_LISTED_MIGRATIONS = 10;

/** Changelog released together with `package.json` in the version commit. */
const CHANGELOG_PATH = path.join(REPOSITORY_ROOT, "CHANGELOG.md");

/** Readers of the changelog, as written in the Codex prompt. */
const CHANGELOG_AUDIENCE = "quien usa TuTribu (miembros y creadores de tribus)";

/** `version` field of `package.json`, replaced in place to keep formatting. */
const PACKAGE_VERSION_FIELD_PATTERN = /("version"\s*:\s*")[^"]+(")/;

/** GitHub `owner/repo` inside an SSH or HTTPS remote URL. */
const GITHUB_REPOSITORY_PATTERN = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/;

/** Length of the abbreviated commit ids shown to the user. */
const SHORT_SHA_LENGTH = 7;

/** Exit code of a release stopped by blockers or a failed step. */
const FAILURE_EXIT_CODE = 1;

/** Answers of the pending-migrations prompt. */
const MIGRATION_CHOICE = { apply: "apply", skip: "skip", cancel: "cancel" };

/** Error raised by a step with a Spanish explanation and a next action. */
class ReleaseStepError extends Error {
  /**
   * @param {string} message - What failed, in Spanish.
   * @param {string} hint - What to do next, in Spanish.
   */
  constructor(message, hint) {
    super(message);
    this.name = "ReleaseStepError";
    this.hint = hint;
  }
}

/** Raised when the user cancels on purpose; ends the run without an error box. */
class ReleaseCancelledError extends Error {}

/**
 * Renders the diagnosis row of the CHANGELOG `[Unreleased]` block.
 *
 * @param {{ exists: boolean, entryCount: number, unknownSections: string[] }} changelog - Unreleased state.
 * @returns {string} Row.
 */
function renderChangelogRow(changelog) {
  if (changelog.unknownSections.length > 0) {
    return renderRow(ICON.failure, "CHANGELOG", paint("red", `secciones no válidas: ${changelog.unknownSections.join(", ")}`));
  }

  if (changelog.entryCount === 0) {
    return renderRow(ICON.warning, "CHANGELOG", paint("yellow", "[Unreleased] vacío: lo completa Codex al versionar"));
  }

  return renderRow(ICON.success, "CHANGELOG", `${changelog.entryCount} entrada(s) en [Unreleased]`);
}

/**
 * Renders the status panel of the diagnosis.
 *
 * @param {object} state - Snapshot from `collectReleaseState`.
 * @returns {string} Box.
 */
function renderDiagnosis(state) {
  const isOnMain = state.currentBranch === MAIN_BRANCH;
  const rows = [
    renderRow(
      isOnMain ? ICON.success : ICON.failure,
      "Rama",
      isOnMain ? MAIN_BRANCH : paint("red", state.currentBranch ?? "HEAD desacoplado")
    ),
    renderRow(
      state.workingTreeChanges.length === 0 ? ICON.success : ICON.failure,
      "Working tree",
      state.workingTreeChanges.length === 0 ? "limpio" : paint("red", `${state.workingTreeChanges.length} cambio(s) sin commitear`)
    ),
  ];

  const { aheadCommits, behindCount } = state.main;
  const syncParts = [];
  if (behindCount > 0) syncParts.push(paint("yellow", `${behindCount} atrás`));
  if (aheadCommits.length > 0) syncParts.push(paint(state.unpushedRelease ? "yellow" : "red", `${aheadCommits.length} adelante`));
  rows.push(
    renderRow(
      aheadCommits.length > 0 && !state.unpushedRelease ? ICON.failure : syncParts.length > 0 ? ICON.warning : ICON.success,
      `${MAIN_BRANCH} ↔ origin`,
      syncParts.length > 0 ? syncParts.join(", ") : "al día"
    ),
    renderRow(
      ICON.info,
      "Último release",
      state.lastRelease
        ? `${paint("cyan", toReleaseTag(state.lastRelease.version))} ${paint("gray", `(${state.lastRelease.sha.slice(0, SHORT_SHA_LENGTH)})`)}`
        : paint("gray", "ninguno todavía")
    )
  );

  if (state.unpushedRelease) {
    rows.push(renderRow(ICON.warning, "A medio subir", paint("yellow", `${state.unpushedRelease.tag} está creado solo en local`)));
  } else {
    const unreleasedCount = state.unreleasedCommits.length;
    rows.push(
      renderRow(
        unreleasedCount > 0 ? ICON.warning : ICON.success,
        "Sin publicar",
        unreleasedCount > 0 ? paint("yellow", `${unreleasedCount} commit(s) en ${REMOTE_MAIN_REF}`) : "nada nuevo desde el último release"
      )
    );
  }

  const { migrations } = state;
  const migrationRow = {
    [MIGRATION_STATUS.upToDate]: [ICON.success, `al día en ${migrations.databaseHost}`],
    [MIGRATION_STATUS.pending]: [ICON.warning, paint("yellow", `${migrations.pending.length} pendiente(s) en ${migrations.databaseHost}`)],
    [MIGRATION_STATUS.unknown]: [ICON.warning, paint("yellow", "no se pudo verificar")],
  }[migrations.status];
  rows.push(renderRow(migrationRow[0], "Migraciones", migrationRow[1]), renderChangelogRow(state.changelog));

  const pinnedNodeVersion = readFileSync(PINNED_NODE_VERSION_PATH, "utf8").trim().replace(/^v/, "");
  const nodeMatches = process.versions.node === pinnedNodeVersion;
  rows.push(
    renderRow(
      nodeMatches ? ICON.success : ICON.warning,
      "Node.js",
      nodeMatches ? process.version : paint("yellow", `${process.version} (.nvmrc pide v${pinnedNodeVersion})`)
    )
  );

  return renderBox({ title: "Diagnóstico", lines: rows, tone: BOX_TONE.info });
}

/**
 * Renders the list of commits that will be released.
 *
 * @param {{ subject: string }[]} commits - Commits, newest first.
 * @param {string} title - Box title.
 * @returns {string} Box.
 */
function renderCommitList(commits, title) {
  const lines = commits.slice(0, MAX_LISTED_COMMITS).map((commit) => `${ICON.bullet} ${commit.subject}`);

  if (commits.length > MAX_LISTED_COMMITS) {
    lines.push(paint("gray", `… y ${commits.length - MAX_LISTED_COMMITS} más`));
  }

  return renderBox({ title, lines, tone: BOX_TONE.accent });
}

/**
 * Renders the plan or the blockers.
 *
 * @param {{ steps: object[], blockers: object[], warnings: string[] }} plan - Plan.
 * @returns {string} Box.
 */
function renderPlan(plan) {
  if (plan.blockers.length > 0) {
    const lines = plan.blockers.flatMap((blocker, index) => [
      ...(index > 0 ? [""] : []),
      `${ICON.failure} ${paint("bold", blocker.title)}`,
      ...blocker.details.map((detail) => `   ${paint("gray", "→")} ${detail}`),
    ]);
    return renderBox({ title: "No se puede publicar todavía", lines, tone: BOX_TONE.danger });
  }

  const lines = plan.steps.flatMap((planStep, index) => [
    `${paint(["bold", "magenta"], `${index + 1}.`)} ${paint("bold", planStep.title)}`,
    ...(planStep.detail ? [`   ${paint("gray", planStep.detail)}`] : []),
  ]);

  for (const warning of plan.warnings) {
    lines.push("", `${ICON.warning} ${paint("yellow", warning)}`);
  }

  return renderBox({ title: "Plan", lines, tone: BOX_TONE.accent });
}

/**
 * Runs a Git command with visible output and fails the step on error.
 *
 * @param {string[]} gitArguments - Git arguments.
 * @param {string} failureMessage - Spanish message when it fails.
 * @param {string} hint - Spanish next action.
 */
async function runGitStep(gitArguments, failureMessage, hint) {
  const exitCode = await runInherited("git", gitArguments, { cwd: REPOSITORY_ROOT });

  if (exitCode !== 0) {
    throw new ReleaseStepError(`${failureMessage} (git ${gitArguments[0]} salió con código ${exitCode}).`, hint);
  }
}

/**
 * Fast-forwards local `main` to `origin/main`.
 */
async function syncMainStep() {
  await runGitStep(
    ["merge", "--ff-only", "--quiet", REMOTE_MAIN_REF],
    `No se pudo actualizar ${MAIN_BRANCH} en fast-forward`,
    `Revisá git status y git log ${REMOTE_MAIN_REF}..${MAIN_BRANCH}.`
  );
  print(`${ICON.success} ${MAIN_BRANCH} quedó igual a ${REMOTE_MAIN_REF}.`);
}

/**
 * Shows the pending migrations, asks for confirmation and applies them.
 *
 * @param {object} context - Release context.
 */
async function applyMigrationsStep(context) {
  const { migrations } = context.state;
  const lines = migrations.pending.slice(0, MAX_LISTED_MIGRATIONS).map((tag) => `${ICON.bullet} ${tag}`);

  if (migrations.pending.length > MAX_LISTED_MIGRATIONS) {
    lines.push(paint("gray", `… y ${migrations.pending.length - MAX_LISTED_MIGRATIONS} más`));
  }

  lines.push("", `${ICON.warning} Destino: ${paint(["bold", "yellow"], migrations.databaseHost)} (DATABASE_MIGRATION_URL del .env)`);
  print(renderBox({ title: "Migraciones pendientes", lines, tone: BOX_TONE.warning }));

  const choice = await select({
    message: "¿Aplicar estas migraciones ahora?",
    options: [
      { label: "Aplicar ahora", hint: "corre pnpm run db:migrate", value: MIGRATION_CHOICE.apply },
      { label: "Saltear", hint: "seguir con el release sin migrar", value: MIGRATION_CHOICE.skip },
      { label: "Cancelar release", value: MIGRATION_CHOICE.cancel },
    ],
  });

  if (choice === MIGRATION_CHOICE.cancel) {
    throw new ReleaseCancelledError();
  }

  if (choice === MIGRATION_CHOICE.skip) {
    print(`${ICON.warning} ${paint("yellow", "Migraciones salteadas: el deploy puede fallar si el código las necesita.")}`);
    return;
  }

  const exitCode = await runInherited(process.execPath, [MIGRATION_SCRIPT_PATH], { cwd: REPOSITORY_ROOT });

  if (exitCode !== 0) {
    throw new ReleaseStepError(`drizzle-kit migrate falló con código ${exitCode}.`, "Revisá el error de arriba; no se subió ninguna versión.");
  }

  const journalEntries = await readMigrationJournalAt(context.reader, ["HEAD"]);
  const recheck = await checkPendingMigrations({ repositoryRoot: REPOSITORY_ROOT, journalEntries });

  if (recheck.status === MIGRATION_STATUS.pending) {
    throw new ReleaseStepError(
      `Siguen pendientes ${recheck.pending.length} migración(es) después de migrar.`,
      "Revisá el journal y la tabla drizzle.__drizzle_migrations."
    );
  }

  print(`${ICON.success} Base de datos al día.`);
}

/**
 * Reads the `[Unreleased]` block of the working-tree CHANGELOG.md.
 *
 * @returns {ReturnType<typeof readUnreleased>} Unreleased state.
 */
function readWorkingUnreleased() {
  return existsSync(CHANGELOG_PATH)
    ? readUnreleased(readFileSync(CHANGELOG_PATH, "utf8"))
    : { exists: false, entryCount: 0, unknownSections: [], body: "" };
}

/**
 * Asks Codex to fill an empty `[Unreleased]` block from the unreleased commits and shows the result.
 *
 * @param {object} context - Release context.
 */
async function generateChangelogStep(context) {
  const prompt = buildChangelogPrompt(context.state.unreleasedCommits, CHANGELOG_AUDIENCE);
  print(paint("gray", "Codex está escribiendo el CHANGELOG a partir de los commits sin publicar…"));
  const exitCode = await runCodex(REPOSITORY_ROOT, prompt);
  const unreleased = readWorkingUnreleased();

  if (exitCode !== 0 || unreleased.entryCount === 0 || unreleased.unknownSections.length > 0) {
    const reason =
      exitCode === CODEX_NOT_FOUND_EXIT_CODE
        ? "no se encontró la CLI de Codex"
        : exitCode !== 0
          ? `Codex terminó con código ${exitCode}`
          : "el bloque sigue vacío o con secciones no válidas";
    throw new ReleaseStepError(
      `No se pudo completar ${UNRELEASED_HEADING} del CHANGELOG: ${reason}.`,
      `Completalo (con la IA o a mano) usando ${CHANGE_TYPES.map((type) => `### ${type}`).join(", ")} y volvé a correr pnpm create-version.`
    );
  }

  print(renderBox({ title: `CHANGELOG · ${UNRELEASED_HEADING} (generado por Codex)`, lines: unreleased.body.split("\n"), tone: BOX_TONE.info }));
}

/**
 * Chooses the next version (flags or prompt), releases the CHANGELOG
 * `[Unreleased]` block and creates the release commit and annotated tag.
 *
 * @param {object} context - Release context.
 */
async function bumpVersionStep(context) {
  const currentVersion = await readPackageVersionAt(context.reader, "HEAD");
  const lastReleaseSha = context.state.lastRelease?.sha;
  const commits = await listCommits(context.reader, lastReleaseSha ? `${lastReleaseSha}..HEAD` : "HEAD");
  print(renderCommitList(commits, `Qué se publica (${commits.length} commit(s))`));

  let nextRelease = resolveRequestedVersion(currentVersion, context.options);

  if (nextRelease) {
    print(`${ICON.info} Versión elegida por flag: ${paint(["bold", "cyan"], nextRelease.version)} (${nextRelease.releaseType})`);
  } else {
    const suggestion = suggestReleaseType(commits);
    const nextVersions = listNextVersions(currentVersion);
    const chosenVersion = await select({
      message: `¿Qué versión publicamos? (actual ${currentVersion})`,
      options: nextVersions.map((candidate) => ({
        label: `${candidate.releaseType.padEnd(5)}  ${currentVersion} → ${candidate.version}`,
        hint: candidate.releaseType === suggestion.releaseType ? `${ICON.star} sugerida: ${suggestion.reason}` : undefined,
        description: RELEASE_TYPE_DESCRIPTION[candidate.releaseType],
        value: candidate.version,
      })),
      defaultIndex: nextVersions.findIndex((candidate) => candidate.releaseType === suggestion.releaseType),
    });
    nextRelease = nextVersions.find((candidate) => candidate.version === chosenVersion);
  }

  const tag = toReleaseTag(nextRelease.version);
  let releasedChangelog;

  try {
    const releaseDate = new Date().toISOString().split("T")[0];
    releasedChangelog = releaseUnreleased(readFileSync(CHANGELOG_PATH, "utf8"), nextRelease.version, releaseDate);
  } catch (error) {
    throw new ReleaseStepError(
      `CHANGELOG.md no está listo: ${error instanceof Error ? error.message : String(error)}`,
      `Completá ${UNRELEASED_HEADING} con ${CHANGE_TYPES.map((type) => `### ${type}`).join(", ")} y volvé a correr pnpm create-version.`
    );
  }

  print(renderBox({ title: `CHANGELOG · ${UNRELEASED_HEADING} → [${nextRelease.version}]`, lines: readWorkingUnreleased().body.split("\n"), tone: BOX_TONE.info }));
  const manifestPath = path.join(REPOSITORY_ROOT, "package.json");
  const manifest = readFileSync(manifestPath, "utf8");
  writeFileSync(manifestPath, manifest.replace(PACKAGE_VERSION_FIELD_PATTERN, `$1${nextRelease.version}$2`));
  writeFileSync(CHANGELOG_PATH, releasedChangelog);

  await runGitStep(["add", "package.json", "CHANGELOG.md"], "No se pudo stagear package.json y CHANGELOG.md", "Revisá git status.");
  await runGitStep(
    ["commit", "--quiet", "-m", nextRelease.version],
    "El commit de versión falló",
    "Corregí el error, descartá el cambio con git checkout package.json CHANGELOG.md y volvé a correr pnpm create-version."
  );
  await runGitStep(
    ["tag", "-a", tag, "-m", nextRelease.version],
    `No se pudo crear el tag ${tag}`,
    `Si ya existe, revisalo con git show ${tag}.`
  );

  context.release = { version: nextRelease.version, tag, previousReleaseSha: lastReleaseSha, commitCount: commits.length };
  print(`${ICON.success} Commit ${paint("bold", nextRelease.version)} y tag ${paint(["bold", "cyan"], tag)} creados en local.`);
}

/**
 * Pushes `main` and the release tag after a last confirmation.
 *
 * @param {object} context - Release context.
 */
async function pushReleaseStep(context) {
  context.release ??= {
    version: context.state.unpushedRelease.version,
    tag: context.state.unpushedRelease.tag,
    previousReleaseSha: context.state.lastRelease?.sha,
    commitCount: null,
  };
  const { tag, version } = context.release;
  const tagExists = (await context.reader.tryGit(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`])) !== null;

  if (!tagExists) {
    await runGitStep(["tag", "-a", tag, "-m", version], `No se pudo crear el tag ${tag}`, `Revisá git tag --list ${tag}.`);
  }

  // The "¿Ejecutamos el plan?" confirmation already covers the push; no second prompt here.
  await runGitStep(
    ["push", "--atomic", RELEASE_REMOTE, MAIN_BRANCH, `refs/tags/${tag}`],
    `El push de ${MAIN_BRANCH} + ${tag} falló`,
    `El release quedó en local: corregí el error y corré pnpm create-version, que retoma el push de ${tag}.`
  );

  const remoteTag = await context.reader.tryGit(["ls-remote", "--tags", RELEASE_REMOTE, tag]);

  if (!remoteTag) {
    throw new ReleaseStepError(`${MAIN_BRANCH} se subió pero ${tag} no aparece en ${RELEASE_REMOTE}.`, `Subilo con git push ${RELEASE_REMOTE} ${tag}.`);
  }

  context.published = true;
}

/** Executors of each plan step. */
const STEP_EXECUTORS = {
  [RELEASE_STEP.syncMain]: syncMainStep,
  [RELEASE_STEP.generateChangelog]: generateChangelogStep,
  [RELEASE_STEP.applyMigrations]: applyMigrationsStep,
  [RELEASE_STEP.bumpVersion]: bumpVersionStep,
  [RELEASE_STEP.pushRelease]: pushReleaseStep,
};

/**
 * Renders the closing summary of a published release.
 *
 * @param {object} context - Release context.
 * @param {number} startedAt - Start timestamp.
 * @returns {string} Box.
 */
function renderPublishedSummary(context, startedAt) {
  const { version, tag, previousReleaseSha, commitCount } = context.release;
  const githubRepository = GITHUB_REPOSITORY_PATTERN.exec(context.remoteUrl)?.[1];
  const lines = [
    `${ICON.success} ${paint("bold", "Versión")}   ${paint(["bold", "greenBright"], version)}  ${paint("gray", `(${tag})`)}`,
  ];

  if (commitCount !== null) {
    lines.push(`${ICON.success} ${paint("bold", "Commits")}   ${commitCount}`);
  }

  lines.push(`${ICON.success} ${paint("bold", "Deploy")}    Vercel detecta el cambio de versión y buildea producción.`);

  if (githubRepository && previousReleaseSha) {
    const previousShortSha = previousReleaseSha.slice(0, SHORT_SHA_LENGTH);
    lines.push(`${ICON.info} ${paint("bold", "Cambios")}   https://github.com/${githubRepository}/compare/${previousShortSha}...${tag}`);
  }

  lines.push("", paint("gray", `Tiempo total: ${formatDuration(measureActiveMs(startedAt))} (sin contar la espera de tus respuestas)`));

  return renderBox({ title: `${ICON.rocket} ${tag} publicado`, lines, tone: BOX_TONE.success });
}

/**
 * Runs the release command.
 *
 * @returns {Promise<number>} Process exit code.
 */
async function main() {
  const startedAt = Date.now();
  let options;

  try {
    options = parseReleaseArguments(process.argv.slice(2));
  } catch (error) {
    print(`${ICON.failure} ${paint("red", error.message)}`);
    return FAILURE_EXIT_CODE;
  }

  if (options.help) {
    print(RELEASE_USAGE.join("\n"));
    return 0;
  }

  const reader = createGitReader(REPOSITORY_ROOT);
  const remoteUrl = (await reader.tryGit(["remote", "get-url", RELEASE_REMOTE])) ?? "";
  const publishedVersion = await readPackageVersionAt(reader, REMOTE_MAIN_REF);
  print(renderBanner({ projectName: PROJECT_NAME, publishedLabel: publishedVersion ? `v${publishedVersion} en producción` : null }));

  const spinner = startSpinner("Diagnosticando el repositorio");
  let state;

  try {
    state = await collectReleaseState({ repositoryRoot: REPOSITORY_ROOT, onProgress: (label) => spinner.update(label) });
    spinner.succeed("Diagnóstico completo");
  } catch (error) {
    spinner.fail("No se pudo diagnosticar el repositorio");
    print(paint("red", error.message));
    return FAILURE_EXIT_CODE;
  }

  print(renderDiagnosis(state));

  if (state.unreleasedCommits.length > 0 && !state.unpushedRelease) {
    print(renderCommitList(state.unreleasedCommits, "Commits sin publicar"));
  }

  const plan = buildReleasePlan(state);
  print(renderPlan(plan));

  // A blocker is an expected outcome already explained in the box, not a
  // command failure: exiting 0 keeps pnpm from appending ELIFECYCLE noise.
  if (plan.blockers.length > 0) {
    return 0;
  }

  if (plan.steps.length === 0) {
    print(renderBox({
      title: "Todo al día",
      lines: [`${ICON.success} No hay nada nuevo para publicar desde ${state.lastRelease ? toReleaseTag(state.lastRelease.version) : "el inicio"}. ¡A disfrutar!`],
      tone: BOX_TONE.success,
    }));
    return 0;
  }

  const willBump = plan.steps.some((planStep) => planStep.id === RELEASE_STEP.bumpVersion);

  if (willBump && state.releasedVersion) {
    try {
      resolveRequestedVersion(state.releasedVersion, options);
    } catch (error) {
      print(`${ICON.failure} ${paint("red", error.message)}`);
      return FAILURE_EXIT_CODE;
    }
  }

  if (options.dryRun) {
    print(`${ICON.info} ${paint("cyan", "--dry-run: no se cambió nada. Corré pnpm create-version para ejecutar el plan.")}`);
    return 0;
  }

  if (!(await confirm("¿Ejecutamos el plan?"))) {
    print(`${ICON.warning} ${paint("yellow", "Release cancelado. No se tocó nada.")}`);
    return 0;
  }

  const context = { state, options, reader, remoteUrl, release: null, published: false };

  for (const [index, planStep] of plan.steps.entries()) {
    print(renderStepHeader(index + 1, plan.steps.length, planStep.title));

    try {
      await STEP_EXECUTORS[planStep.id](context);
    } catch (error) {
      if (error instanceof ReleaseCancelledError) {
        return 0;
      }

      const lines = [`${ICON.failure} ${error.message}`];
      if (error instanceof ReleaseStepError) {
        lines.push("", `${paint("bold", "Qué hacer:")} ${error.hint}`);
      }
      lines.push("", paint("gray", "pnpm create-version retoma desde el primer paso que falte."));
      print(renderBox({ title: `Falló el paso ${index + 1}: ${planStep.title}`, lines, tone: BOX_TONE.danger }));
      return FAILURE_EXIT_CODE;
    }
  }

  print("");
  print(
    context.published
      ? renderPublishedSummary(context, startedAt)
      : renderBox({ title: "Listo", lines: [`${ICON.success} Plan completado en ${formatDuration(measureActiveMs(startedAt))} (sin contar la espera de tus respuestas).`], tone: BOX_TONE.success })
  );

  return 0;
}

main().then((exitCode) => {
  process.exitCode = exitCode;
});
