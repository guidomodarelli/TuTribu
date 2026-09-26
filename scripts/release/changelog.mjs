/**
 * Reads and releases CHANGELOG.md in the Keep a Changelog format.
 *
 * Every change adds its entries under `## [Unreleased]`, grouped by change
 * type (`### Added`, `### Changed`, `### Deprecated`, `### Removed`,
 * `### Fixed`, `### Security`). Releasing moves that block under
 * `## [X.Y.Z] - YYYY-MM-DD` and leaves an empty `## [Unreleased]` on top.
 * Headings of older releases without brackets (`## 0.6.0 - 2026-09-23`)
 * remain valid.
 *
 * @module changelog
 */

/** Heading of the block that collects changes not yet released. */
export const UNRELEASED_HEADING = "## [Unreleased]";

/** Change types allowed as `###` sections, in Keep a Changelog order. */
export const CHANGE_TYPES = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];

/** Any release-level heading: `## [Unreleased]`, `## [0.7.0] - 2026-09-26` or `## 0.6.0 - 2026-09-23`. */
const RELEASE_HEADING = /^## +\[?([^\]\s]+)\]?[^\n]*$/gmu;
/** Unreleased heading, case-insensitive, as its own line. */
const UNRELEASED_LINE = /^## +\[Unreleased\][ \t]*$/imu;
/** A change entry line. */
const ENTRY_LINE = /^\s*- +\S/mu;
/** A change-type section heading inside a release block. */
const SECTION_HEADING = /^### +(.+?)\s*$/gmu;

/**
 * Splits the changelog into release blocks in document order.
 * @param {string} changelog - CHANGELOG.md contents.
 * @returns {{ label: string, heading: string, start: number, bodyStart: number, end: number }[]} Blocks.
 */
function listBlocks(changelog) {
  const headings = [...changelog.matchAll(RELEASE_HEADING)];
  return headings.map((match, index) => ({
    label: match[1],
    heading: match[0],
    start: /** @type {number} */ (match.index),
    bodyStart: /** @type {number} */ (match.index) + match[0].length,
    end: headings[index + 1]?.index ?? changelog.length,
  }));
}

/**
 * Counts the change entries of a block body.
 * @param {string} body - Block text below its heading.
 * @returns {number} Number of `- ` lines.
 */
function countEntries(body) {
  return body.split(/\r?\n/u).filter((line) => ENTRY_LINE.test(line)).length;
}

/**
 * Describes the `## [Unreleased]` block.
 * @param {string} changelog - CHANGELOG.md contents.
 * @returns {{ exists: boolean, entryCount: number, unknownSections: string[], body: string }} Unreleased state.
 */
export function readUnreleased(changelog) {
  const block = listBlocks(changelog).find((candidate) => UNRELEASED_LINE.test(candidate.heading));
  if (!block) return { exists: false, entryCount: 0, unknownSections: [], body: "" };
  const body = changelog.slice(block.bodyStart, block.end);
  const unknownSections = [...body.matchAll(SECTION_HEADING)].map((match) => match[1]).filter((name) => !CHANGE_TYPES.includes(name));
  return { exists: true, entryCount: countEntries(body), unknownSections, body: body.trim() };
}

/**
 * Returns the newest released block (the first one that is not `[Unreleased]`).
 * @param {string} changelog - CHANGELOG.md contents.
 * @returns {{ version: string, entryCount: number } | null} Latest release entry.
 */
export function readLatestRelease(changelog) {
  const block = listBlocks(changelog).find((candidate) => !UNRELEASED_LINE.test(candidate.heading));
  return block ? { version: block.label, entryCount: countEntries(changelog.slice(block.bodyStart, block.end)) } : null;
}

/**
 * Moves the `[Unreleased]` changes under a new version heading and leaves an empty `[Unreleased]` block.
 * @param {string} changelog - CHANGELOG.md contents.
 * @param {string} version - Version being released.
 * @param {string} releaseDate - Date in `YYYY-MM-DD` format.
 * @returns {string} Released changelog.
 * @throws {Error} When `[Unreleased]` is missing, empty or uses an unknown section.
 */
export function releaseUnreleased(changelog, version, releaseDate) {
  const unreleased = readUnreleased(changelog);
  if (!unreleased.exists) throw new Error(`create-version: CHANGELOG.md needs a "${UNRELEASED_HEADING}" block`);
  if (unreleased.unknownSections.length > 0) {
    throw new Error(`create-version: CHANGELOG.md [Unreleased] uses unknown sections (${unreleased.unknownSections.join(", ")}); use ${CHANGE_TYPES.join(", ")}`);
  }
  if (unreleased.entryCount === 0) throw new Error("create-version: CHANGELOG.md [Unreleased] has no changes to release");
  const block = /** @type {NonNullable<ReturnType<typeof listBlocks>[number]>} */ (listBlocks(changelog).find((candidate) => UNRELEASED_LINE.test(candidate.heading)));
  const released = `${UNRELEASED_HEADING}\n\n## [${version}] - ${releaseDate}\n\n${unreleased.body}\n\n`;
  return `${changelog.slice(0, block.start)}${released}${changelog.slice(block.end).replace(/^\s+/u, "")}`;
}
