import { PostgresTribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";

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

function createRepository(
  execute: jest.Mock,
  createMercadoPagoSubscription = jest.fn(),
  getMercadoPagoPreapprovalStatus = jest.fn(),
  resolvePublicAppBaseUrl = jest.fn(() => "https://tutribu.example.com")
) {
  return new PostgresTribeMemberSubscriptionRepository(
    async (callback) => callback({ execute } as never),
    createMercadoPagoSubscription,
    getMercadoPagoPreapprovalStatus,
    resolvePublicAppBaseUrl
  );
}

describe("PostgresTribeMemberSubscriptionRepository", () => {
  it("reuses an existing pending checkout before creating another provider subscription", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
          current_price_id: "price-1",
          current_price_name: "Plan mensual",
          current_user_email: "member@example.com",
          existing_checkout_url:
            "https://www.mercadopago.com.ar/subscriptions/existing",
          existing_membership_status: "blocked",
          existing_status_reason: "payment_blocked",
          has_active_invitation: true,
          mercado_pago_preapproval_plan_id: "plan-1",
          tribe_id: "tribe-1",
        },
      ],
    });
    const createMercadoPagoSubscription = jest.fn();
    const repository = createRepository(execute, createMercadoPagoSubscription);

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/existing",
      status: "pending",
    });

    expect(createMercadoPagoSubscription).not.toHaveBeenCalled();
    expect(getSqlText(execute.mock.calls[0]?.[0])).toMatch(
      /tribe_member_subscriptions\.status = .*pending/
    );
  });

  it("does not reuse checkout operations unless a pending local subscription still exists", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_id: "price-1",
            current_price_name: "Plan mensual",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_membership_status: "blocked",
            existing_status_reason: "payment_blocked",
            has_active_invitation: true,
            mercado_pago_preapproval_plan_id: "plan-1",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "subscription-2" }] })
      .mockResolvedValueOnce({ rows: [] });
    const createMercadoPagoSubscription = jest.fn(async () => ({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/new",
      providerSubscriptionId: "preapproval-2",
    }));
    const repository = createRepository(execute, createMercadoPagoSubscription);

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/new",
      status: "pending",
    });

    expect(createMercadoPagoSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "new-attempt",
        preapprovalPlanId: "plan-1",
      })
    );
  });

  it("rejects checkout starts when the invitation is not active for the tribe", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
          current_price_id: "price-1",
          current_price_name: "Plan mensual",
          current_user_email: "member@example.com",
          existing_checkout_url:
            "https://www.mercadopago.com.ar/subscriptions/existing",
          existing_membership_status: null,
          existing_status_reason: null,
          has_active_invitation: false,
          mercado_pago_preapproval_plan_id: "plan-1",
          tribe_id: "tribe-1",
        },
      ],
    });
    const createMercadoPagoSubscription = jest.fn();
    const repository = createRepository(execute, createMercadoPagoSubscription);

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "revoked-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "invalid_invitation",
    });

    expect(createMercadoPagoSubscription).not.toHaveBeenCalled();
  });

  it("checks the provider preapproval status before processing created webhooks", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            operation_inserted: "operation-1",
            subscription_found: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const getMercadoPagoPreapprovalStatus = jest.fn(async () => "pending");
    const repository = createRepository(
      execute,
      jest.fn(),
      getMercadoPagoPreapprovalStatus
    );

    await expect(
      repository.handleWebhook({
        eventId: "event-1",
        resourceId: "preapproval-1",
        topic: "subscription_preapproval.created",
      })
    ).resolves.toEqual({
      status: "processed",
    });

    expect(getMercadoPagoPreapprovalStatus).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalId: "preapproval-1",
    });
  });

  it("keeps canceled subscriptions retryable as payment blocks", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            operation_inserted: "operation-1",
            subscription_found: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const getMercadoPagoPreapprovalStatus = jest.fn(async () => "canceled");
    const repository = createRepository(
      execute,
      jest.fn(),
      getMercadoPagoPreapprovalStatus
    );

    await expect(
      repository.handleWebhook({
        eventId: "event-1",
        resourceId: "preapproval-1",
        topic: "subscription_preapproval.updated",
      })
    ).resolves.toEqual({
      status: "processed",
    });

    expect(
      (execute.mock.calls[1]?.[0] as { queryChunks?: unknown[] }).queryChunks
    ).toEqual(expect.arrayContaining(["payment_blocked"]));
  });

  it("keeps memberships active while subscriptions are in grace period", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            operation_inserted: "operation-1",
            subscription_found: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const getMercadoPagoPreapprovalStatus = jest.fn(async () => "paused");
    const repository = createRepository(
      execute,
      jest.fn(),
      getMercadoPagoPreapprovalStatus
    );

    await expect(
      repository.handleWebhook({
        eventId: "event-1",
        resourceId: "preapproval-1",
        topic: "subscription_preapproval.updated",
      })
    ).resolves.toEqual({
      status: "processed",
    });

    expect(getSqlText(execute.mock.calls[2]?.[0])).toMatch(
      /status in \([\s\S]*active[\s\S]*grace_period[\s\S]*\)/
    );
  });

  it("keeps webhooks retryable when the local subscription is not stored yet", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: null,
          subscription_found: false,
        },
      ],
    });
    const getMercadoPagoPreapprovalStatus = jest.fn();
    const repository = createRepository(
      execute,
      jest.fn(),
      getMercadoPagoPreapprovalStatus
    );

    await expect(
      repository.handleWebhook({
        eventId: "event-1",
        resourceId: "preapproval-1",
        topic: "subscription_preapproval.created",
      })
    ).resolves.toEqual({
      status: "retryable_webhook",
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(getMercadoPagoPreapprovalStatus).not.toHaveBeenCalled();
  });

  it("does not call the provider again for duplicate webhook events", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
          operation_inserted: null,
          subscription_found: true,
        },
      ],
    });
    const getMercadoPagoPreapprovalStatus = jest.fn();
    const repository = createRepository(
      execute,
      jest.fn(),
      getMercadoPagoPreapprovalStatus
    );

    await expect(
      repository.handleWebhook({
        eventId: "event-1",
        resourceId: "preapproval-1",
        topic: "subscription_preapproval.updated",
      })
    ).resolves.toEqual({
      status: "duplicate_webhook",
    });

    expect(getMercadoPagoPreapprovalStatus).not.toHaveBeenCalled();
  });
});
