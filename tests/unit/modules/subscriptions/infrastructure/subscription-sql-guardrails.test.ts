import { readFileSync } from "node:fs";
import path from "node:path";

const SUBSCRIPTIONS_MIGRATION_PATH =
  "database/migrations/20260506130000_create_tribe_subscriptions.sql";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function readPolicyBlock(migration: string, policyName: string): string {
  const policyStart = migration.indexOf(`CREATE POLICY "${policyName}"`);
  const policyEnd = migration.indexOf(";", policyStart);

  if (policyStart === -1 || policyEnd === -1) {
    return "";
  }

  return migration.slice(policyStart, policyEnd + 1);
}

describe("Subscription SQL guardrails", () => {
  it("requires an active invitation for member subscription inserts", () => {
    const migration = readWorkspaceFile(SUBSCRIPTIONS_MIGRATION_PATH);
    const policy = readPolicyBlock(
      migration,
      "Members can create own pending subscription rows"
    );

    expect(policy).toMatch(/user_id = public\.current_app_user_id\(\)/);
    expect(policy).toMatch(/status = 'pending'/);
    expect(policy).toMatch(/tribe_subscription_prices\.id = tribe_member_subscriptions\.price_id/);
    expect(policy).toMatch(/tribe_subscription_prices\.tribe_id = tribe_member_subscriptions\.tribe_id/);
    expect(policy).toMatch(/tribe_subscription_prices\.is_current = true/);
    expect(policy).toMatch(/tribe_invitations\.token_hash = nullif\(/);
    expect(policy).toMatch(/current_setting\('app\.current_invitation_hash', true\)/);
    expect(policy).toMatch(/tribe_invitations\.status = 'active'/);
  });

  it("limits subscription row updates to verified Mercado Pago webhooks", () => {
    const migration = readWorkspaceFile(SUBSCRIPTIONS_MIGRATION_PATH);
    const policy = readPolicyBlock(
      migration,
      "Verified Mercado Pago webhooks can update subscription rows"
    );

    expect(policy).toMatch(/FOR UPDATE/);
    expect(policy).toMatch(/USING \(public\.is_mercado_pago_webhook_verified\(\)\)/);
    expect(policy).toMatch(/WITH CHECK \(public\.is_mercado_pago_webhook_verified\(\)\)/);
    expect(policy).not.toMatch(/user_id = public\.current_app_user_id\(\)/);
  });
});
