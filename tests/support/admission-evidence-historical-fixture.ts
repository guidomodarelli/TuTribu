/** Preserves pre-guard evidence while installing every original schema artifact on an owned branch. @module admission-evidence-historical-fixture */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { applyAdmissionRetentionHistoricalPrefix } from "./admission-retention-migration-prefix";
import { ADMISSION_EVIDENCE_HISTORY_FIXTURE } from "./constants/admission-evidence-history";
import { ADMISSION_RETENTION_COMPOSITION_FIXTURE } from "./constants/admission-retention-composition";

/** Describes trusted repository migration metadata without changing its original timestamp or order. */
type HistoricalMigrationEntry = { tag: string; when: number };

/**
 * Loads coherent old evidence before its first guard, then truthfully records the SQL actually installed.
 *
 * 1. Runs the genuine prefix before the evidence guard and the unchanged dependent snapshot artifacts.
 * 2. Seeds history before the guard exists, without disabling any installed protection or changing the clock.
 * 3. Installs the original guard and records all executed artifacts atomically at their original journal times.
 *
 * @param database - Confirmed disposable branch with native owner-only migration access.
 * @param seedHistory - Inserts the complete historical account, tenant and evidence lineage.
 * @returns After the historical schema is registered so the normal migration command can finish the upgrade.
 * @throws When the original snapshot or migration history differs from the expected predecessor.
 */
export async function prepareHistoricalAdmissionEvidence(database: AcademyAdmissionTestDatabase, seedHistory: () => Promise<void>): Promise<void> {
  const directory = ADMISSION_RETENTION_COMPOSITION_FIXTURE.migrationDirectory;
  const journal = JSON.parse(await readFile(join(directory, ADMISSION_RETENTION_COMPOSITION_FIXTURE.journalRelativePath), "utf8")) as { entries: HistoricalMigrationEntry[] };
  const guardIndex = journal.entries.findIndex((entry) => entry.tag === ADMISSION_EVIDENCE_HISTORY_FIXTURE.evidenceGuardMigrationTag);
  const cutoffIndex = journal.entries.findIndex((entry) => entry.tag === ADMISSION_EVIDENCE_HISTORY_FIXTURE.snapshotCutoffMigrationTag);
  if (guardIndex < 1 || cutoffIndex <= guardIndex) throw new Error("AdmissionEvidenceHistory.prepare failed: original_snapshot_missing");
  await applyAdmissionRetentionHistoricalPrefix(database, ADMISSION_EVIDENCE_HISTORY_FIXTURE.evidenceGuardMigrationTag);
  const snapshot = journal.entries.slice(guardIndex, cutoffIndex);
  for (const entry of snapshot.slice(1)) await database.applyMigration(`${entry.tag}.sql`);
  await seedHistory();
  const executed = await Promise.all(snapshot.map(async (entry) => {
    const artifact = await readFile(join(directory, `${entry.tag}.sql`), "utf8");
    return { ...entry, artifact, hash: createHash("sha256").update(artifact).digest("hex") };
  }));
  const predecessor = journal.entries[guardIndex - 1];
  const predecessorHash = createHash("sha256").update(await readFile(join(directory, `${predecessor.tag}.sql`), "utf8")).digest("hex");
  await database.withContext({ userId: null, email: null }, async (transaction) => {
    const lastMigration = (await transaction.execute<{ hash: string; created_at: string }>(sql`select hash,created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`)).rows[0];
    if (lastMigration?.hash !== predecessorHash || Number(lastMigration.created_at) !== predecessor.when) throw new Error("AdmissionEvidenceHistory.prepare failed: migration_predecessor_changed");
    await transaction.execute(sql.raw(executed[0].artifact));
    await transaction.execute(sql`insert into drizzle.__drizzle_migrations(hash,created_at) values ${sql.join(executed.map((entry) => sql`(${entry.hash},${entry.when})`), sql`,`)}`);
  });
}
