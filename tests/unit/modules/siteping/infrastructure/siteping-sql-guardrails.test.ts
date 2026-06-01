import { readFileSync } from "node:fs";
import { join } from "node:path";

const SITEPING_PROJECT_ADMIN_MIGRATION_PATH =
  "database/migrations/20260601120000_allow_siteping_project_admin_feedback_management.sql";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("SitePing SQL guardrails", () => {
  it("keeps project feedback management scoped by transaction context under RLS", () => {
    const migration = readWorkspaceFile(SITEPING_PROJECT_ADMIN_MIGRATION_PATH);
    const migrationJournal = JSON.parse(
      readWorkspaceFile("database/migrations/meta/_journal.json")
    ) as { entries: Array<{ tag: string }> };

    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.current_siteping_project_name\(\)/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.is_siteping_project_admin\(project_name text\)/);
    expect(migration).toMatch(/current_setting\('app\.siteping_project_admin', true\)/);
    expect(migration).toMatch(/project_name = public\.current_siteping_project_name\(\)/);
    expect(migration).toMatch(/ON public\.siteping_feedbacks[\s\S]*FOR SELECT[\s\S]*USING \(public\.is_siteping_project_admin\(project_name\)\)/);
    expect(migration).toMatch(/ON public\.siteping_feedbacks[\s\S]*FOR UPDATE[\s\S]*WITH CHECK \(public\.is_siteping_project_admin\(project_name\)\)/);
    expect(migration).toMatch(/ON public\.siteping_feedbacks[\s\S]*FOR DELETE[\s\S]*USING \(public\.is_siteping_project_admin\(project_name\)\)/);
    expect(migration).toMatch(/ON public\.siteping_annotations[\s\S]*FOR SELECT[\s\S]*public\.is_siteping_project_admin\(siteping_feedbacks\.project_name\)/);
    expect(migration).toMatch(/ON public\.siteping_annotations[\s\S]*FOR DELETE[\s\S]*public\.is_siteping_project_admin\(siteping_feedbacks\.project_name\)/);
    expect(migration).not.toMatch(/FOR ALL/);
    expect(migrationJournal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "20260601120000_allow_siteping_project_admin_feedback_management",
        }),
      ])
    );
  });
});
