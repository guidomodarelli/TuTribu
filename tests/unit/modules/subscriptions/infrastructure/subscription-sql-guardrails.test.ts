import { readFileSync } from "node:fs";
import path from "node:path";

const SUBSCRIPTIONS_MIGRATION_PATH =
  "database/migrations/20260506130000_create_tribe_subscriptions.sql";
const REMOVED_MEMBERSHIP_STATUS_MIGRATION_PATH =
  "database/migrations/20260511120000_add_removed_subscription_membership_status.sql";

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

  it("allows token refreshes from checkout and verified webhook contexts", () => {
    const migration = readWorkspaceFile(SUBSCRIPTIONS_MIGRATION_PATH);
    const policy = readPolicyBlock(
      migration,
      "Checkout and verified webhooks can refresh payment integration tokens"
    );

    expect(policy).toMatch(/FOR UPDATE/);
    expect(policy).toMatch(/provider = 'mercado_pago'/);
    expect(policy).toMatch(/public\.is_mercado_pago_webhook_verified\(\)/);
    expect(policy).toMatch(
      /current_setting\('app\.subscription_checkout_tribe_id', true\)/
    );
    expect(policy).not.toMatch(/connected_by = public\.current_app_user_id\(\)/);
  });

  it("stores the current membership block reason for payment reentry checks", () => {
    const migration = readWorkspaceFile(SUBSCRIPTIONS_MIGRATION_PATH);
    const paidMembershipPolicy = readPolicyBlock(
      migration,
      "Authenticated users can create paid pending memberships"
    );
    const webhookMembershipPolicy = readPolicyBlock(
      migration,
      "Verified Mercado Pago webhooks can update paid memberships"
    );

    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS status_reason text NOT NULL DEFAULT 'none'/);
    expect(migration).toMatch(/tribe_members_status_reason_check/);
    expect(paidMembershipPolicy).toMatch(/status_reason = 'payment_blocked'/);
    expect(webhookMembershipPolicy).toMatch(/status_reason IN \('none', 'payment_blocked'\)/);
  });

  it("keeps paused member subscriptions inside the current subscription uniqueness guard", () => {
    const migration = readWorkspaceFile(REMOVED_MEMBERSHIP_STATUS_MIGRATION_PATH);

    expect(migration).toContain(
      "DROP INDEX IF EXISTS public.tribe_member_subscriptions_active_key"
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS tribe_member_subscriptions_active_key"
    );
    expect(migration).toContain(
      "WHERE status IN ('active', 'pending', 'grace_period', 'past_due', 'payment_blocked', 'paused')"
    );
  });
});
