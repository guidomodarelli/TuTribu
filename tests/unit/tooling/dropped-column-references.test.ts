import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Guardrail for the failure mode that took the tribe pages down in production:
 * a migration dropped `tribe_story_settings.logo_url` while a repository query
 * kept selecting it. Nothing caught it — the SQL lives in a template string, so
 * TypeScript cannot see it, and the repository unit tests mock the executor, so
 * the query is never parsed by Postgres.
 *
 * The check replays every versioned migration in order, tracks which columns are
 * currently added or dropped per table, and fails when server code still
 * references a qualified column the schema no longer has.
 */

const MIGRATIONS_DIRECTORY = "database/migrations";
const SCANNED_SOURCE_DIRECTORIES = ["src/modules", "app"];
const SCANNED_SOURCE_EXTENSIONS = [".ts", ".tsx"];

const ADD_COLUMN_PATTERN = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi;
const DROP_COLUMN_PATTERN = /drop\s+column\s+(?:if\s+exists\s+)?([a-z_]+)/gi;
const ALTER_TABLE_STATEMENT_PATTERN =
  /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z_]+)([\s\S]*?);/gi;

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function listMigrationFileNames(): string[] {
  return readdirSync(path.join(process.cwd(), MIGRATIONS_DIRECTORY))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
}

function listSourceFiles(): string[] {
  const sourceFiles: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(path.join(process.cwd(), directory), {
      withFileTypes: true,
    })) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (
        SCANNED_SOURCE_EXTENSIONS.some((extension) =>
          entry.name.endsWith(extension)
        )
      ) {
        sourceFiles.push(entryPath);
      }
    }
  };

  for (const directory of SCANNED_SOURCE_DIRECTORIES) {
    walk(directory);
  }

  return sourceFiles;
}

/**
 * Replays the migrations in order and returns the columns each table dropped
 * without adding them back afterwards.
 */
function collectDroppedColumnsByTable(): Map<string, Set<string>> {
  const droppedColumns = new Map<string, Set<string>>();

  for (const migrationFileName of listMigrationFileNames()) {
    const migrationSql = readWorkspaceFile(
      `${MIGRATIONS_DIRECTORY}/${migrationFileName}`
    );

    for (const statement of migrationSql.matchAll(
      ALTER_TABLE_STATEMENT_PATTERN
    )) {
      const [, tableName, statementBody] = statement;
      const tableDroppedColumns =
        droppedColumns.get(tableName) ?? new Set<string>();

      for (const addedColumn of statementBody.matchAll(ADD_COLUMN_PATTERN)) {
        tableDroppedColumns.delete(addedColumn[1]);
      }

      for (const droppedColumn of statementBody.matchAll(DROP_COLUMN_PATTERN)) {
        tableDroppedColumns.add(droppedColumn[1]);
      }

      droppedColumns.set(tableName, tableDroppedColumns);
    }
  }

  return droppedColumns;
}

describe("dropped column references", () => {
  it("keeps at least one dropped column in the migration history", () => {
    const droppedColumns = collectDroppedColumnsByTable();
    const totalDropped = [...droppedColumns.values()].reduce(
      (total, columns) => total + columns.size,
      0
    );

    // Guards the guard: if the parser stops finding drops, the check below
    // would pass vacuously.
    expect(totalDropped).toBeGreaterThan(0);
  });

  it("never references a column the migrations dropped", () => {
    const droppedColumns = collectDroppedColumnsByTable();
    const staleReferences: string[] = [];

    for (const sourceFile of listSourceFiles()) {
      const sourceCode = readWorkspaceFile(sourceFile);

      for (const [tableName, columns] of droppedColumns) {
        for (const columnName of columns) {
          if (sourceCode.includes(`${tableName}.${columnName}`)) {
            staleReferences.push(
              `${sourceFile}: ${tableName}.${columnName}`
            );
          }
        }
      }
    }

    expect(staleReferences).toEqual([]);
  });
});
