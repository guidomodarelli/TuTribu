import { readFileSync } from "node:fs";
import path from "node:path";

const SUBSCRIPTIONS_MIGRATION_PATH =
  "database/migrations/20260506130000_create_tribe_subscriptions.sql";
const REMOVED_MEMBERSHIP_STATUS_MIGRATION_PATH =
  "database/migrations/20260511120000_add_removed_subscription_membership_status.sql";
const TRIAL_PERIOD_MIGRATION_PATH =
  "database/migrations/20260512120000_add_subscription_price_trial_period.sql";
const TRIAL_PERIOD_CONSTRAINT_FIX_MIGRATION_PATH =
  "database/migrations/20260512130000_fix_subscription_price_trial_period_constraint.sql";
const TRIAL_PERIOD_LIMIT_MIGRATION_PATH =
  "database/migrations/20260513140000_limit_subscription_price_trial_days.sql";
const FREE_JOIN_MIGRATION_PATH =
  "database/migrations/20260524100000_add_free_join_to_tribes.sql";

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

  it("persists optional Mercado Pago trial periods on subscription prices", () => {
    const migration = readWorkspaceFile(TRIAL_PERIOD_MIGRATION_PATH);
    const constraintFixMigration = readWorkspaceFile(
      TRIAL_PERIOD_CONSTRAINT_FIX_MIGRATION_PATH
    );
    const constraintLimitMigration = readWorkspaceFile(
      TRIAL_PERIOD_LIMIT_MIGRATION_PATH
    );

    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS trial_frequency integer"
    );
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS trial_frequency_type text"
    );
    expect(migration).toContain("tribe_subscription_prices_trial_period_check");
    expect(migration).toContain("trial_frequency > 0");
    expect(migration).toContain("trial_frequency_type IN ('days', 'months')");
    expect(constraintFixMigration).toContain(
      "DROP CONSTRAINT IF EXISTS tribe_subscription_prices_trial_period_check"
    );
    expect(constraintFixMigration).toContain(
      "trial_frequency IS NOT NULL"
    );
    expect(constraintFixMigration).toContain(
      "trial_frequency_type IS NOT NULL"
    );
    expect(constraintLimitMigration).toContain(
      "trial_frequency BETWEEN 1 AND 14"
    );
    expect(constraintLimitMigration).toContain(
      "mercado_pago_preapproval_plan_id IS NOT NULL"
    );
    expect(constraintLimitMigration).toContain("SET trial_frequency = 1");
    expect(constraintLimitMigration).toContain("SET trial_frequency = 14");
    expect(constraintLimitMigration).toContain(
      "trial_frequency_type = 'months'"
    );
  });

  it("preserves free join mode for tribes without a current Mercado Pago plan", () => {
    const migration = readWorkspaceFile(FREE_JOIN_MIGRATION_PATH);

    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS free_join_is_current boolean NOT NULL DEFAULT true"
    );
    expect(migration).toContain(
      "ALTER COLUMN free_join_is_current SET DEFAULT true"
    );
    expect(migration).toContain("SET free_join_is_current = false");
    expect(migration).toContain("tribe_subscription_prices.is_current = true");
    expect(migration).toContain(
      "tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL"
    );
    expect(migration).toMatch(
      /UPDATE public\.tribe_subscription_prices[\s\S]*SET is_current = false[\s\S]*mercado_pago_preapproval_plan_id IS NULL/
    );
    expect(migration).toContain(
      "CREATE POLICY \"Leaders can update tribe free join mode\""
    );
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain(
      "public.can_manage_tribe_subscription_prices(id)"
    );
    expect(migration).toContain(
      "GRANT UPDATE (free_join_is_current) ON public.tribes TO authenticated"
    );
    expect(migration).toContain(
      "CREATE POLICY \"Verified Mercado Pago webhooks can update tribe free join mode\""
    );
    expect(migration).toContain(
      "public.is_mercado_pago_webhook_verified()"
    );
    expect(migration).toContain(
      "CREATE POLICY \"Authenticated users can activate own free invitation memberships\""
    );
    expect(migration).toContain(
      "GRANT UPDATE (status, status_reason, joined_via) ON public.tribe_members TO authenticated"
    );
  });
});
