import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SITEPING_REMOVE_ADMIN_MIGRATION_PATH =
  "database/migrations/20260604120000_remove_siteping_project_admin_management.sql";
const SITEPING_BASE_FEEDBACK_MIGRATION_PATH =
  "database/migrations/20260531120000_create_siteping_feedback.sql";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("SitePing SQL guardrails", () => {
  it("drops the project-admin elevation so feedback management is ownership-only", () => {
    const migration = readWorkspaceFile(SITEPING_REMOVE_ADMIN_MIGRATION_PATH);
    const migrationJournal = JSON.parse(
      readWorkspaceFile("database/migrations/meta/_journal.json")
    ) as { entries: Array<{ tag: string }> };

    expect(migration).toMatch(
      /DROP FUNCTION IF EXISTS public\.is_siteping_project_admin\(project_name text\)/
    );
    expect(migration).toMatch(
      /DROP FUNCTION IF EXISTS public\.current_siteping_project_name\(\)/
    );
    expect(migration).toMatch(
      /DROP POLICY IF EXISTS "SitePing project admins can read project feedback" ON public\.siteping_feedbacks/
    );
    expect(migration).toMatch(
      /DROP POLICY IF EXISTS "SitePing project admins can update project feedback" ON public\.siteping_feedbacks/
    );
    expect(migration).toMatch(
      /DROP POLICY IF EXISTS "SitePing project admins can delete project feedback" ON public\.siteping_feedbacks/
    );
    expect(migration).toMatch(
      /DROP POLICY IF EXISTS "SitePing project admins can read project annotations" ON public\.siteping_annotations/
    );
    expect(migration).toMatch(
      /DROP POLICY IF EXISTS "SitePing project admins can delete project annotations" ON public\.siteping_annotations/
    );
    expect(migration).not.toMatch(/CREATE POLICY/);
    expect(migrationJournal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "20260604120000_remove_siteping_project_admin_management",
        }),
      ])
    );
  });

  it("keeps the base ownership policy scoping feedback to its creator", () => {
    const migration = readWorkspaceFile(SITEPING_BASE_FEEDBACK_MIGRATION_PATH);

    expect(migration).toMatch(
      /CREATE POLICY "Users can manage own SitePing feedback"[\s\S]*USING \(created_by = public\.current_app_user_id\(\)\)/
    );
  });
});
