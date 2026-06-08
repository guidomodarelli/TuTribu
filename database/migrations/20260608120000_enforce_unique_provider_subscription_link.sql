-- Enforce a one-to-one link between a Mercado Pago preapproval and a local
-- member subscription row.
--
-- Security hardening for the post-payment membership assignment flow. The
-- "Members can attach own pending checkout identifiers" UPDATE policy lets a
-- member set mercado_pago_preapproval_id on their own pending reservation, but
-- it cannot bind the incoming identifier to a checkout the member actually
-- started. Without this constraint an authenticated member with an in-flight
-- checkout could attach another member's preapproval id (visible in return
-- URLs) to their own pending row; a later verified webhook updates every row
-- that shares that preapproval id (the webhook UPDATE is intentionally not
-- user-scoped), so the second member's subscription and membership would be
-- activated using the first member's payment.
--
-- A partial unique index makes the same preapproval id impossible to share
-- across rows at the database layer, so the cross-binding attach fails with a
-- unique violation instead of succeeding. NULL identifiers (reserved checkouts
-- not yet linked to a provider preapproval) are exempt, so multiple unlinked
-- reservations remain valid.
--
-- Validated on an ephemeral Neon branch: existing production data has at most
-- one row per preapproval id, so the index builds without a prior cleanup.

CREATE UNIQUE INDEX IF NOT EXISTS tribe_member_subscriptions_provider_preapproval_key
ON public.tribe_member_subscriptions (mercado_pago_preapproval_id)
WHERE mercado_pago_preapproval_id IS NOT NULL;
