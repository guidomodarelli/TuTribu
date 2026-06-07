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
const SUBSCRIPTION_ASSOCIATION_MIGRATION_PATH =
  "database/migrations/20260525120000_add_subscription_association_to_tribe_invitations.sql";
const REFERRAL_METADATA_MIGRATION_PATH =
  "database/migrations/20260528120000_add_referral_metadata_to_invitations.sql";
const OPEN_JOIN_MIGRATION_PATH =
  "database/migrations/20260606120000_allow_open_join_subscription.sql";
const OPEN_JOIN_ATTRIBUTION_UPDATE_MIGRATION_PATH =
  "database/migrations/20260606150000_allow_open_join_attribution_update.sql";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function readPolicyBlock(migration: string, policyName: string): string {
  const createPolicyStart = migration.indexOf(`CREATE POLICY "${policyName}"`);
  const alterPolicyStart = migration.indexOf(`ALTER POLICY "${policyName}"`);
  const policyStart =
    createPolicyStart === -1 ? alterPolicyStart : createPolicyStart;
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

  it("allows specific invitation prices through checkout RLS", () => {
    const migration = readWorkspaceFile(SUBSCRIPTION_ASSOCIATION_MIGRATION_PATH);
    const subscriptionPolicy = readPolicyBlock(
      migration,
      "Members can create own pending subscription rows"
    );
    const pendingMembershipPolicy = readPolicyBlock(
      migration,
      "Authenticated users can create paid pending memberships"
    );
    const retryMembershipPolicy = readPolicyBlock(
      migration,
      "Authenticated users can recover paid retry memberships"
    );
    const invitationPricePolicy = readPolicyBlock(
      migration,
      "Authenticated users can read specific invitation prices"
    );

    expect(subscriptionPolicy).toMatch(/tribe_subscription_prices\.is_current = true/);
    expect(subscriptionPolicy).toMatch(/subscription_association_type = 'specific'/);
    expect(subscriptionPolicy).toMatch(
      /subscription_price_id = tribe_member_subscriptions\.price_id/
    );
    expect(pendingMembershipPolicy).toMatch(/subscription_association_type = 'specific'/);
    expect(pendingMembershipPolicy).toMatch(
      /tribe_subscription_prices\.mercado_pago_preapproval_plan_id IS NOT NULL/
    );
    expect(retryMembershipPolicy).toMatch(/subscription_association_type = 'specific'/);
    expect(retryMembershipPolicy).toMatch(
      /tribe_subscription_prices\.mercado_pago_preapproval_plan_id IS NOT NULL/
    );
    expect(invitationPricePolicy).toMatch(/FOR SELECT/);
    expect(invitationPricePolicy).toMatch(/subscription_association_type = 'specific'/);
    expect(invitationPricePolicy).toMatch(
      /subscription_price_id = tribe_subscription_prices\.id/
    );
    expect(invitationPricePolicy).toMatch(
      /tribe_subscription_prices\.mercado_pago_preapproval_plan_id IS NOT NULL/
    );
    expect(invitationPricePolicy).toMatch(
      /tribe_invitations\.token_hash = nullif\(\s*current_setting\('app\.current_invitation_hash', true\),\s*''\s*\)/
    );
  });

  it("allows free invitation links to reactivate blocked members", () => {
    const migration = readWorkspaceFile(SUBSCRIPTION_ASSOCIATION_MIGRATION_PATH);
    const freeInvitationPolicy = readPolicyBlock(
      migration,
      "Authenticated users can activate own free invitation memberships"
    );

    expect(freeInvitationPolicy).toMatch(/tribes\.free_join_is_current = true/);
    expect(freeInvitationPolicy).toMatch(/subscription_association_type = 'free'/);
    expect(freeInvitationPolicy).toMatch(
      /tribe_invitations\.token_hash = nullif\(\s*current_setting\('app\.current_invitation_hash', true\),\s*''\s*\)/
    );
  });

  it("restricts active invitation membership inserts to free links", () => {
    const migration = readWorkspaceFile(SUBSCRIPTION_ASSOCIATION_MIGRATION_PATH);
    const activeInvitationInsertPolicy = readPolicyBlock(
      migration,
      "Authenticated users can accept active invitations"
    );

    expect(migration).toContain(
      "DROP POLICY IF EXISTS \"Authenticated users can accept active invitations\""
    );
    expect(activeInvitationInsertPolicy).toMatch(/FOR INSERT/);
    expect(activeInvitationInsertPolicy).toMatch(/status = 'active'/);
    expect(activeInvitationInsertPolicy).toMatch(/status_reason = 'none'/);
    expect(activeInvitationInsertPolicy).toMatch(/joined_via = 'free_invitation'/);
    expect(activeInvitationInsertPolicy).toMatch(
      /subscription_association_type = 'free'/
    );
    expect(activeInvitationInsertPolicy).toMatch(
      /tribes\.free_join_is_current = true/
    );
    expect(activeInvitationInsertPolicy).not.toMatch(
      /subscription_association_type = 'specific'/
    );
  });

  it("requires price management for billing-affecting invitation links", () => {
    const migration = readWorkspaceFile(SUBSCRIPTION_ASSOCIATION_MIGRATION_PATH);
    const createPolicy = readPolicyBlock(
      migration,
      "Invitation managers can create invitations"
    );
    const updatePolicy = readPolicyBlock(
      migration,
      "Invitation managers can update invitations"
    );

    expect(createPolicy).toMatch(/public\.can_manage_tribe_invitations\(tribe_id\)/);
    expect(createPolicy).toMatch(/subscription_association_type = 'current'/);
    expect(createPolicy).toMatch(
      /OR public\.can_manage_tribe_subscription_prices\(tribe_id\)/
    );
    expect(createPolicy).toMatch(
      /tribe_subscription_prices\.id = subscription_price_id/
    );
    expect(createPolicy).toMatch(
      /tribe_subscription_prices\.tribe_id = tribe_invitations\.tribe_id/
    );
    expect(createPolicy).toMatch(
      /tribe_subscription_prices\.mercado_pago_preapproval_plan_id IS NOT NULL/
    );
    expect(updatePolicy).toMatch(/public\.can_manage_tribe_invitations\(tribe_id\)/);
    expect(updatePolicy).toMatch(/status = 'revoked'/);
    expect(updatePolicy).toMatch(/subscription_association_type = 'current'/);
    expect(updatePolicy).toMatch(
      /OR public\.can_manage_tribe_subscription_prices\(tribe_id\)/
    );
    expect(updatePolicy).toMatch(
      /tribe_subscription_prices\.id = subscription_price_id/
    );
    expect(updatePolicy).toMatch(
      /tribe_subscription_prices\.tribe_id = tribe_invitations\.tribe_id/
    );
    expect(updatePolicy).toMatch(
      /tribe_subscription_prices\.mercado_pago_preapproval_plan_id IS NOT NULL/
    );
  });

  it("gates tokenless open-join inserts behind a current paid plan and a non-conduct-blocked visitor", () => {
    const migration = readWorkspaceFile(OPEN_JOIN_MIGRATION_PATH);
    const subscriptionPolicy = readPolicyBlock(
      migration,
      "Members can create own pending subscription rows"
    );
    const pendingMembershipPolicy = readPolicyBlock(
      migration,
      "Authenticated users can create paid pending memberships"
    );

    // The authorization helper bypasses tribe RLS through SECURITY DEFINER so a
    // non-member can be evaluated against the private tribe state.
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.can_open_join_tribe_paid_plan"
    );
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toMatch(/free_join_is_current = false/);
    expect(migration).toMatch(/is_current = true/);
    expect(migration).toMatch(
      /mercado_pago_preapproval_plan_id IS NOT NULL/
    );
    expect(migration).toMatch(/status_reason = 'conduct_blocked'/);

    // Both INSERT policies must expose the tokenless open-join branch while
    // keeping the original invitation branches intact.
    expect(subscriptionPolicy).toMatch(
      /public\.can_open_join_tribe_paid_plan\(\s*tribe_member_subscriptions\.tribe_id\s*\)/
    );
    expect(subscriptionPolicy).toMatch(/current_setting\('app\.current_invitation_hash', true\)/);
    expect(pendingMembershipPolicy).toMatch(
      /public\.can_open_join_tribe_paid_plan\(\s*tribe_members\.tribe_id\s*\)/
    );
    expect(pendingMembershipPolicy).toMatch(/joined_via_invitation_id IS NULL/);
  });

  it("exposes the tokenless open-join branch on the pending attribution update policy", () => {
    const migration = readWorkspaceFile(
      OPEN_JOIN_ATTRIBUTION_UPDATE_MIGRATION_PATH
    );
    const attributionPolicy = readPolicyBlock(
      migration,
      "Authenticated users can update pending invitation attribution"
    );

    // The attribution UPDATE policy must keep gating blocked/payment_blocked rows
    // and the invitation branch, while adding the tokenless open-join branch so
    // persistReservedPlanCheckout's conflict update no longer depends on the
    // recover-retry policy's coincidental WITH CHECK coverage.
    expect(attributionPolicy).toMatch(/status = 'blocked'/);
    expect(attributionPolicy).toMatch(/status_reason = 'payment_blocked'/);
    expect(attributionPolicy).toMatch(
      /tribe_invitations\.id = joined_via_invitation_id/
    );
    expect(attributionPolicy).toMatch(
      /current_setting\('app\.current_invitation_hash', true\)/
    );
    expect(attributionPolicy).toMatch(/joined_via_invitation_id IS NULL/);
    expect(attributionPolicy).toMatch(
      /public\.can_open_join_tribe_paid_plan\(\s*tribe_members\.tribe_id\s*\)/
    );
  });

  it("adds referral metadata without adding payment integration to invitations", () => {
    const migration = readWorkspaceFile(REFERRAL_METADATA_MIGRATION_PATH);
    const updatePolicy = readPolicyBlock(
      migration,
      "Invitation managers can update invitations"
    );

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS channel text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS campaign_name text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS referrer_handle text");
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS joined_via_invitation_id uuid"
    );
    expect(migration).toContain("ON DELETE SET NULL");
    expect(migration).toContain("idx_tribe_invitations_tribe_channel");
    expect(migration).toContain("idx_tribe_members_joined_via_invitation");
    expect(migration).not.toMatch(
      /ALTER TABLE public\.tribe_invitations\s+ADD COLUMN IF NOT EXISTS payment_integration_id/
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.update_tribe_invitation_referral_metadata"
    );
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.update_tribe_invitation_referral_metadata"
    );
    expect(migration).toContain(
      "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN"
    );
    expect(migration).not.toContain("app.invitation_referral_metadata_update");
    expect(migration).not.toContain("referral_metadata_update_context");
    expect(updatePolicy).toMatch(/public\.can_manage_tribe_invitations\(tribe_id\)/);
    expect(updatePolicy).toMatch(
      /public\.can_manage_tribe_subscription_prices\(tribe_id\)/
    );
    expect(updatePolicy).toMatch(/current_user = \(/);
    expect(updatePolicy).toMatch(
      /pg_get_userbyid\(pg_class\.relowner\)/
    );
    expect(updatePolicy).toMatch(
      /'public\.tribe_invitations'::regclass/
    );
  });

  it("requires active invitation attribution to match the current token hash", () => {
    const migration = readWorkspaceFile(REFERRAL_METADATA_MIGRATION_PATH);
    const pendingMembershipPolicy = readPolicyBlock(
      migration,
      "Authenticated users can create paid pending memberships"
    );
    const retryMembershipPolicy = readPolicyBlock(
      migration,
      "Authenticated users can recover paid retry memberships"
    );
    const freeInvitationPolicy = readPolicyBlock(
      migration,
      "Authenticated users can accept active invitations"
    );
    const pendingAttributionPolicy = readPolicyBlock(
      migration,
      "Authenticated users can update pending invitation attribution"
    );

    expect(pendingMembershipPolicy).toMatch(/joined_via_invitation_id IS NULL/);
    expect(pendingMembershipPolicy).toMatch(
      /tribe_invitations\.id = joined_via_invitation_id/
    );
    expect(pendingMembershipPolicy).toMatch(
      /current_setting\('app\.current_invitation_hash', true\)/
    );
    expect(retryMembershipPolicy).toMatch(/joined_via_invitation_id IS NULL/);
    expect(retryMembershipPolicy).toMatch(
      /nullif\(\s*current_setting\('app\.current_invitation_hash', true\),\s*''\s*\) IS NULL/
    );
    expect(retryMembershipPolicy).toMatch(
      /tribe_invitations\.id = joined_via_invitation_id/
    );
    expect(freeInvitationPolicy).toMatch(
      /joined_via_invitation_id = tribe_invitations\.id/
    );
    expect(pendingAttributionPolicy).toMatch(/status = 'blocked'/);
    expect(pendingAttributionPolicy).toMatch(/status_reason = 'payment_blocked'/);
    expect(pendingAttributionPolicy).toMatch(
      /tribe_invitations\.id = joined_via_invitation_id/
    );
    expect(pendingAttributionPolicy).toMatch(
      /current_setting\('app\.current_invitation_hash', true\)/
    );
  });

});
