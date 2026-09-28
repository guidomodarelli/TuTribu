import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";

import { encryptInvitationToken } from "@/src/modules/tribes/infrastructure/encryption/tribe-invitation-token-cipher";
import { PostgresTribeInvitationRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-invitation-repository";

const TRIBE_INVITATION_TOKEN_KEY_ENV = "TRIBE_INVITATION_TOKEN_ENCRYPTION_KEY";

function setTestEncryptionKey(): void {
  process.env[TRIBE_INVITATION_TOKEN_KEY_ENV] = randomBytes(32).toString(
    "base64"
  );
}

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      return "";
    })
    .join("");
}

const NULL_REFERRAL_METADATA = {
  campaignName: null,
  channel: null,
  referrerHandle: null,
} as const;

describe("PostgresTribeInvitationRepository", () => {
  const previousKey = process.env[TRIBE_INVITATION_TOKEN_KEY_ENV];

  beforeEach(() => {
    setTestEncryptionKey();
  });

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env[TRIBE_INVITATION_TOKEN_KEY_ENV];
    } else {
      process.env[TRIBE_INVITATION_TOKEN_KEY_ENV] = previousKey;
    }
  });

  it("creates invitations with a one-time visible token, token hash, and manager permission guard", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          associated_plan_amount_cents: null,
          associated_plan_currency: null,
          associated_plan_frequency: null,
          associated_plan_id: null,
          associated_plan_name: null,
          associated_plan_status: null,
          created_at: "2026-04-26T07:00:00.000Z",
          created_by_name: "Grace Hopper",
          id: "invitation-1",
          status: "created" as const,
          subscription_association_type: "current",
          subscription_price_id: null,
        },
      ],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        baseUrl: "https://tutribu.example.com",
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        referralMetadata: NULL_REFERRAL_METADATA,
        subscriptionAssociation: { type: "current" },
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      invitationUrl: "https://tutribu.example.com/matematica-pro/invitar/plain-token",
      status: "created" as const,
    });
  });

  it("only creates specific-price invitations for active provider-backed prices", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          associated_plan_amount_cents: 500000,
          associated_plan_currency: "ARS",
          associated_plan_frequency: "monthly",
          associated_plan_id: "550e8400-e29b-41d4-a716-446655440010",
          associated_plan_name: "Plan mensual",
          associated_plan_status: "active",
          created_at: "2026-04-26T07:00:00.000Z",
          created_by_name: "Grace Hopper",
          id: "invitation-1",
          status: "created" as const,
          subscription_association_type: "specific",
          subscription_price_id: "550e8400-e29b-41d4-a716-446655440010",
        },
      ],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        baseUrl: "https://tutribu.example.com",
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        referralMetadata: NULL_REFERRAL_METADATA,
        subscriptionAssociation: {
          priceId: "550e8400-e29b-41d4-a716-446655440010",
          type: "specific",
        },
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      status: "created" as const,
    });
  });

  it("maps missing invitation storage during creation to setup_required", async () => {
    const execute = vi.fn(async (...args: unknown[]) => { void args;
      throw {
        cause: {
          code: "42P01",
        },
      };
    });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        baseUrl: "https://tutribu.example.com",
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        referralMetadata: NULL_REFERRAL_METADATA,
        subscriptionAssociation: { type: "current" },
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "setup_required" as const });
  });

  it("maps a missing encrypted token column during creation to setup_required", async () => {
    const execute = vi.fn(async (...args: unknown[]) => { void args;
      throw {
        cause: {
          code: "42703",
        },
      };
    });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        baseUrl: "https://tutribu.example.com",
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        referralMetadata: NULL_REFERRAL_METADATA,
        subscriptionAssociation: { type: "current" },
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "setup_required" as const });
  });

  it("lists active invitations rebuilding the acceptance link from the encrypted token", async () => {
    const encryptedActiveToken = encryptInvitationToken("active-token");
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          associated_plan_amount_cents: null,
          associated_plan_currency: null,
          associated_plan_frequency: null,
          associated_plan_id: null,
          associated_plan_name: null,
          associated_plan_status: null,
          created_at: "2026-04-26T07:00:00.000Z",
          created_by_name: "Grace Hopper",
          id: "550e8400-e29b-41d4-a716-446655440000",
          subscription_association_type: "current",
          subscription_price_id: null,
          token_encrypted: encryptedActiveToken,
        },
        {
          associated_plan_amount_cents: null,
          associated_plan_currency: null,
          associated_plan_frequency: null,
          associated_plan_id: null,
          associated_plan_name: null,
          associated_plan_status: null,
          created_at: "2026-04-26T07:05:00.000Z",
          created_by_name: "Ada Lovelace",
          id: "550e8400-e29b-41d4-a716-446655440001",
          subscription_association_type: "current",
          subscription_price_id: null,
          token_encrypted: null,
        },
      ],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        baseUrl: "https://tutribu.example.com",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual([
      {
        createdAt: "2026-04-26T07:00:00.000Z",
        createdByName: "Grace Hopper",
        id: "550e8400-e29b-41d4-a716-446655440000",
        invitationUrl:
          "https://tutribu.example.com/matematica-pro/invitar/active-token",
        subscriptionAssociation: { type: "current" },
      },
      {
        createdAt: "2026-04-26T07:05:00.000Z",
        createdByName: "Ada Lovelace",
        id: "550e8400-e29b-41d4-a716-446655440001",
        invitationUrl: null,
        subscriptionAssociation: { type: "current" },
      },
    ]);
  });

  it("includes the Mercado Pago account and trial period for specific-price associations", async () => {
    const encryptedActiveToken = encryptInvitationToken("active-token");
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          associated_plan_amount_cents: 1500,
          associated_plan_currency: "ARS",
          associated_plan_frequency: "monthly",
          associated_plan_id: "550e8400-e29b-41d4-a716-446655440010",
          associated_plan_mercado_pago_account_email: "guido@example.com",
          associated_plan_mercado_pago_account_label: "[Guido] Test",
          associated_plan_name: "[Guido] Test",
          associated_plan_status: "active",
          associated_plan_trial_frequency: 7,
          associated_plan_trial_frequency_type: "days",
          created_at: "2026-04-26T07:00:00.000Z",
          created_by_name: "Grace Hopper",
          id: "550e8400-e29b-41d4-a716-446655440000",
          subscription_association_type: "specific",
          subscription_price_id: "550e8400-e29b-41d4-a716-446655440010",
          token_encrypted: encryptedActiveToken,
        },
      ],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        baseUrl: "https://tutribu.example.com",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual([
      {
        createdAt: "2026-04-26T07:00:00.000Z",
        createdByName: "Grace Hopper",
        id: "550e8400-e29b-41d4-a716-446655440000",
        invitationUrl:
          "https://tutribu.example.com/matematica-pro/invitar/active-token",
        subscriptionAssociation: {
          plan: {
            amountCents: 1500,
            currency: "ARS",
            frequency: "monthly",
            id: "550e8400-e29b-41d4-a716-446655440010",
            mercadoPagoAccountEmail: "guido@example.com",
            mercadoPagoAccountLabel: "[Guido] Test",
            name: "[Guido] Test",
            status: "active" as const,
            trial: { frequency: 7, frequencyType: "days" },
          },
          priceId: "550e8400-e29b-41d4-a716-446655440010",
          type: "specific",
        },
      },
    ]);
  });

  it("updates referral metadata through the metadata-only database function", async () => {
    const encryptedActiveToken = encryptInvitationToken("active-token");
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          associated_plan_amount_cents: null,
          associated_plan_currency: null,
          associated_plan_frequency: null,
          associated_plan_id: null,
          associated_plan_mercado_pago_account_email: null,
          associated_plan_mercado_pago_account_label: null,
          associated_plan_name: null,
          associated_plan_status: null,
          associated_plan_trial_frequency: null,
          associated_plan_trial_frequency_type: null,
          campaign_name: "Lanzamiento mayo",
          channel: "instagram",
          created_at: "2026-04-26T07:00:00.000Z",
          created_by_name: "Grace Hopper",
          id: "550e8400-e29b-41d4-a716-446655440000",
          referrer_handle: "@partner",
          status: "updated" as const,
          subscription_association_type: "current",
          subscription_price_id: null,
          token_encrypted: encryptedActiveToken,
        },
      ],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateReferralMetadata({
        baseUrl: "https://tutribu.example.com",
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        referralMetadata: {
          campaignName: "Lanzamiento mayo",
          channel: "instagram",
          referrerHandle: "@partner",
        },
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      invitation: {
        campaignName: "Lanzamiento mayo",
        channel: "instagram",
        createdAt: "2026-04-26T07:00:00.000Z",
        createdByName: "Grace Hopper",
        id: "550e8400-e29b-41d4-a716-446655440000",
        invitationUrl:
          "https://tutribu.example.com/matematica-pro/invitar/active-token",
        referrerHandle: "@partner",
        subscriptionAssociation: { type: "current" },
      },
      status: "updated" as const,
    });
  });

  it("reads conversion metrics grouped by invitation and payment account", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          campaign_name: "Lanzamiento mayo",
          channel: "instagram",
          clicks: null,
          invitation_id: "550e8400-e29b-41d4-a716-446655440000",
          mercado_pago_account_email: "partner@example.com",
          mercado_pago_account_label: "Partner MP",
          paid_active: "2",
          payment_integration_id: "550e8400-e29b-41d4-a716-446655440020",
          referrer_handle: "@partner",
          revenue_cents: "10000",
          signups: "3",
        },
      ],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getConversionMetrics({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual([
      {
        campaignName: "Lanzamiento mayo",
        channel: "instagram",
        clicks: null,
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        mercadoPagoAccountEmail: "partner@example.com",
        mercadoPagoAccountLabel: "Partner MP",
        paidActive: 2,
        paymentIntegrationId: "550e8400-e29b-41d4-a716-446655440020",
        referrerHandle: "@partner",
        revenueCents: 10000,
        signups: 3,
      },
    ]);
  });

  it("returns null acceptance links when decryption fails for a stored row", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          associated_plan_amount_cents: null,
          associated_plan_currency: null,
          associated_plan_frequency: null,
          associated_plan_id: null,
          associated_plan_name: null,
          associated_plan_status: null,
          created_at: "2026-04-26T07:00:00.000Z",
          created_by_name: "Grace Hopper",
          id: "550e8400-e29b-41d4-a716-446655440000",
          subscription_association_type: "current",
          subscription_price_id: null,
          token_encrypted: "v1.bad.bad.bad",
        },
      ],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        baseUrl: "https://tutribu.example.com",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual([
      {
        createdAt: "2026-04-26T07:00:00.000Z",
        createdByName: "Grace Hopper",
        id: "550e8400-e29b-41d4-a716-446655440000",
        invitationUrl: null,
        subscriptionAssociation: { type: "current" },
      },
    ]);
  });

  it("returns an empty list when invitation storage has not been migrated yet", async () => {
    const execute = vi.fn(async (...args: unknown[]) => { void args;
      throw {
        cause: {
          code: "42P01",
        },
      };
    });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        baseUrl: "https://tutribu.example.com",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual([]);
  });

  it("returns an empty list when the encrypted token column has not been migrated yet", async () => {
    const execute = vi.fn(async (...args: unknown[]) => { void args;
      throw {
        cause: {
          code: "42703",
        },
      };
    });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        baseUrl: "https://tutribu.example.com",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual([]);
  });

  it("revokes active invitations with manager permission guard", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "revoked" as const }],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.revoke({
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" as const });
  });

  it("maps malformed invitation identifiers to not_found before querying Postgres", async () => {
    const execute = vi.fn();
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.revoke({
        invitationId: "not-a-uuid",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "not_found" as const });

    expect(execute).not.toHaveBeenCalled();
  });

  it("only updates invitation associations to active provider-backed prices", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          associated_plan_amount_cents: 500000,
          associated_plan_currency: "ARS",
          associated_plan_frequency: "monthly",
          associated_plan_id: "550e8400-e29b-41d4-a716-446655440010",
          associated_plan_name: "Plan mensual",
          associated_plan_status: "active",
          created_at: "2026-04-26T07:00:00.000Z",
          created_by_name: "Grace Hopper",
          id: "550e8400-e29b-41d4-a716-446655440000",
          status: "updated" as const,
          subscription_association_type: "specific",
          subscription_price_id: "550e8400-e29b-41d4-a716-446655440010",
          token_encrypted: encryptInvitationToken("active-token"),
        },
      ],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateSubscriptionAssociation({
        baseUrl: "https://tutribu.example.com",
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        subscriptionAssociation: {
          priceId: "550e8400-e29b-41d4-a716-446655440010",
          type: "specific",
        },
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      status: "updated" as const,
    });
  });

  it("accepts invitations idempotently without persisting the plain token", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "accepted" as const }],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.accept({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "accepted" as const });
  });

  it("rechecks membership after insert conflicts so concurrent accepts stay idempotent", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "accepted" as const }],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.accept({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "accepted" as const });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    const insertConflictPosition = sqlText.indexOf(
      "on conflict (tribe_id, user_id) do nothing"
    );
    const postInsertMembershipPosition = sqlText.indexOf(
      "post_insert_membership"
    );

    expect(insertConflictPosition).toBeGreaterThan(-1);
    expect(postInsertMembershipPosition).toBeGreaterThan(insertConflictPosition);
  });

  it(
    "tags accepted free-mode memberships with joined_via='free_invitation'",
    async () => {
      const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
        rows: [{ status: "accepted" as const }],
      }); });
      const repository = new PostgresTribeInvitationRepository(async (callback) =>
        callback({ execute } as never)
      );

      await expect(
        repository.accept({
          token: "plain-token",
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({ status: "accepted" as const });

    }
  );

  it("accepts free invitations only when free join is current", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "accepted" as const }],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.accept({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "accepted" as const });
  });

  it(
    "recovers free invitations from removed memberships whose subscription went inactive",
    async () => {
      const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
        rows: [{ status: "accepted" as const }],
      }); });
      const repository = new PostgresTribeInvitationRepository(async (callback) =>
        callback({ execute } as never)
      );

      await expect(
        repository.accept({
          token: "plain-token",
          tribeSlug: "matematica-pro",
        })
      ).resolves.toEqual({ status: "accepted" as const });

    }
  );

  it("maps revoked invitation acceptance to a controlled result", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "revoked" as const }],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.accept({
        token: "revoked-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" as const });
  });

  it("does not require subscription checkout for revoked invitations", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "revoked" as const }],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.accept({
        token: "revoked-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" as const });
  });

  it("resolves revoked invitations before requiring visible tribe access", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "revoked" as const }],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.accept({
        token: "revoked-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" as const });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    const targetInvitationPosition = sqlText.indexOf("target_invitation as");
    const targetTribePosition = sqlText.indexOf("target_tribe as");
    const revokedStatusPosition = sqlText.indexOf("status = ");
    const invalidFallbackPosition = sqlText.indexOf(
      "not exists (select 1 from target_invitation)"
    );

    expect(targetInvitationPosition).toBeGreaterThan(-1);
    expect(targetTribePosition).toBeGreaterThan(-1);
    expect(targetInvitationPosition).toBeLessThan(targetTribePosition);
    expect(revokedStatusPosition).toBeLessThan(invalidFallbackPosition);
  });

  it("returns the current active subscription offer for an active invitation", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          amount_cents: 500000,
          currency: "ARS",
          frequency: "monthly",
          name: "Plan mensual",
        },
      ],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getSubscriptionOffer({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      price: {
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available" as const,
    });
  });

  it("returns unavailable when the invitation has no active current subscription offer", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [],
    }); });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.getSubscriptionOffer({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "unavailable" as const });
  });
});
