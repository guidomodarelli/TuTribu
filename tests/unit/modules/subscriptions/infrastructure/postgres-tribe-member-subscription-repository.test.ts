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
        "queryChunks" in chunk
      ) {
        return getSqlText(chunk);
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
  updateMercadoPagoPreapprovalStatus = jest.fn(),
  resolvePublicAppBaseUrl = jest.fn(() => "https://tutribu.example.com"),
  refreshMercadoPagoAccessToken = jest.fn()
) {
  return new PostgresTribeMemberSubscriptionRepository(
    async (callback) => callback({ execute } as never),
    createMercadoPagoSubscription,
    getMercadoPagoPreapprovalStatus,
    updateMercadoPagoPreapprovalStatus,
    resolvePublicAppBaseUrl,
    refreshMercadoPagoAccessToken
  );
}

describe("PostgresTribeMemberSubscriptionRepository", () => {
  it("validates Mercado Pago return ids only for the current pending subscription", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ has_pending_subscription_return: true }],
    }));
    const repository = createRepository(execute);

    await expect(
      repository.hasPendingSubscriptionReturn({
        providerSubscriptionId: "preapproval-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toBe(true);

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toMatch(/tribe_member_subscriptions\.mercado_pago_preapproval_id =/);
    expect(sqlText).toMatch(/tribe_member_subscriptions\.user_id = public\.current_app_user_id\(\)/);
    expect(sqlText).toMatch(/tribe_member_subscriptions\.status = .*pending/);
    expect(sqlText).toMatch(/tribes\.slug =/);
  });

  it("reuses an existing pending checkout before creating another provider subscription", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
          current_price_id: "price-1",
          current_price_plan_id: "plan-1",
          current_price_name: "Plan mensual",
          current_user_email: "member@example.com",
          existing_checkout_url:
            "https://www.mercadopago.com.ar/subscriptions/existing",
          existing_membership_status: "blocked",
          existing_membership_status_reason: "payment_blocked",
          has_active_invitation: true,
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
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_plan_id: "plan-1",
            current_price_name: "Plan mensual",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_membership_status: "blocked",
            existing_membership_status_reason: "payment_blocked",
            has_active_invitation: true,
          tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ checkout_url: null, reserved_subscription_id: "subscription-2" }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "subscription-2" }] });
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
        amountCents: 1500,
        currency: "ARS",
        externalReference: "subscription-2",
        idempotencyKey: "new-attempt",
      })
    );
  });

  it("restores removed subscription memberships when reserving a new paid checkout", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_plan_id: "plan-1",
            current_price_name: "Plan mensual",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_membership_status: "removed",
            existing_membership_status_reason: "subscription_inactive",
            has_active_invitation: true,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ checkout_url: null, reserved_subscription_id: "subscription-2" }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "subscription-2" }] });
    const createMercadoPagoSubscription = jest.fn(async () => ({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/new",
      providerSubscriptionId: "preapproval-2",
    }));
    const repository = createRepository(execute, createMercadoPagoSubscription);

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "removed-member-retry",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/new",
      status: "pending",
    });

    const reservationSql = getSqlText(execute.mock.calls[1]?.[0]);
    const membershipPersistenceSql = getSqlText(execute.mock.calls[3]?.[0]);

    expect(reservationSql).toMatch(
      /on conflict \(tribe_id, user_id\) do update[\s\S]*status = 'blocked'[\s\S]*status_reason = .*payment_blocked[\s\S]*status = 'removed'[\s\S]*status_reason = .*subscription_inactive/
    );
    expect(membershipPersistenceSql).toMatch(
      /on conflict \(tribe_id, user_id\) do update[\s\S]*status = 'blocked'[\s\S]*status_reason = .*payment_blocked[\s\S]*status = 'removed'[\s\S]*status_reason = .*subscription_inactive/
    );
  });

  it("rejects conduct-blocked members even when old subscriptions were payment-blocked", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
          current_price_id: "price-1",
          current_price_plan_id: "plan-1",
          current_price_name: "Plan mensual",
          current_user_email: "member@example.com",
          existing_checkout_url: null,
          existing_membership_status: "blocked",
          existing_membership_status_reason: "conduct_blocked",
          has_active_invitation: true,
          tribe_id: "tribe-1",
        },
      ],
    });
    const createMercadoPagoSubscription = jest.fn();
    const repository = createRepository(execute, createMercadoPagoSubscription);

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "conduct-blocked-retry",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "conduct_blocked",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toMatch(/tribe_members\.status_reason/);
    expect(sqlText).not.toMatch(/existing_subscription/);
    expect(createMercadoPagoSubscription).not.toHaveBeenCalled();
  });

  it("does not create a provider checkout when another request already reserved the subscription", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_plan_id: "plan-1",
            current_price_name: "Plan mensual",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_membership_status: null,
            existing_membership_status_reason: null,
            has_active_invitation: true,
          tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ reserved_subscription_id: null }] });
    const createMercadoPagoSubscription = jest.fn();
    const repository = createRepository(execute, createMercadoPagoSubscription);

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "racing-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "payment_blocked",
    });

    expect(createMercadoPagoSubscription).not.toHaveBeenCalled();
    expect(getSqlText(execute.mock.calls[1]?.[0])).toMatch(
      /insert into public\.tribe_member_subscriptions/
    );
  });

  it("recovers stale pending reservations that never reached Mercado Pago", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_plan_id: "plan-1",
            current_price_name: "Plan mensual",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_membership_status: "blocked",
            existing_membership_status_reason: "payment_blocked",
            has_active_invitation: true,
          tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            checkout_url: null,
            reserved_subscription_id: "stale-subscription-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "stale-subscription-1" }] });
    const createMercadoPagoSubscription = jest.fn(async () => ({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/recovered",
      providerSubscriptionId: "preapproval-recovered",
    }));
    const repository = createRepository(execute, createMercadoPagoSubscription);

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "recovered-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/recovered",
      status: "pending",
    });

    const reservationSql = getSqlText(execute.mock.calls[1]?.[0]);

    expect(reservationSql).toMatch(/existing_recoverable_reservation/);
    expect(reservationSql).toMatch(/mercado_pago_preapproval_id is null/);
    expect(reservationSql).toMatch(/5 minutes/);
    expect(createMercadoPagoSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 1500,
        currency: "ARS",
        externalReference: "stale-subscription-1",
        idempotencyKey: "recovered-attempt",
      })
    );
  });

  it("refreshes expired Mercado Pago tokens before creating provider checkouts", async () => {
    const expiredTokenDate = new Date(Date.now() - 60_000).toISOString();
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "expired-access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_plan_id: "plan-1",
            current_price_name: "Plan mensual",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_membership_status: null,
            existing_membership_status_reason: null,
            has_active_invitation: true,            refresh_token: "refresh-token",
            token_expires_at: expiredTokenDate,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ checkout_url: null, reserved_subscription_id: "subscription-2" }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "subscription-2" }] });
    const createMercadoPagoSubscription = jest.fn(async () => ({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/new",
      providerSubscriptionId: "preapproval-2",
    }));
    const refreshMercadoPagoAccessToken = jest.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "seller-1",
      refreshToken: "new-refresh-token",
    }));
    const repository = createRepository(
      execute,
      createMercadoPagoSubscription,
      jest.fn(),
      jest.fn(),
      jest.fn(() => "https://tutribu.example.com"),
      refreshMercadoPagoAccessToken
    );

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

    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith("refresh-token");
    expect(createMercadoPagoSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "fresh-access-token",
      })
    );
    expect(getSqlText(execute.mock.calls[1]?.[0])).toMatch(
      /update public\.tribe_payment_integrations/
    );
    expect(getSqlText(execute.mock.calls[1]?.[0])).toMatch(
      /set_config\([\s\S]*app\.subscription_checkout_tribe_id/
    );
  });

  it("releases the local reservation when Mercado Pago checkout creation fails", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_plan_id: "plan-1",
            current_price_name: "Plan mensual",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_membership_status: null,
            existing_membership_status_reason: null,
            has_active_invitation: true,
          tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ checkout_url: null, reserved_subscription_id: "subscription-2" }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const createMercadoPagoSubscription = jest.fn(async () => {
      throw new Error("provider unavailable");
    });
    const repository = createRepository(execute, createMercadoPagoSubscription);

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "retryable-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "payment_blocked",
    });

    expect(getSqlText(execute.mock.calls[2]?.[0])).toMatch(
      /set\s+status = .*canceled/
    );
  });

  it("rejects checkout starts when the invitation is not active for the tribe", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
          current_price_id: "price-1",
          current_price_plan_id: "plan-1",
          current_price_name: "Plan mensual",
          current_user_email: "member@example.com",
          existing_checkout_url:
            "https://www.mercadopago.com.ar/subscriptions/existing",
          existing_membership_status: null,
          existing_membership_status_reason: null,
          has_active_invitation: false,
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
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            existing_operation_id: null,
            subscription_found: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ operation_inserted: "operation-1" }] })
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

  it("marks canceled subscriptions as removed access by subscription inactivity", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            existing_operation_id: null,
            subscription_found: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ operation_inserted: "operation-1" }] })
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

    expect(getSqlText(execute.mock.calls[3]?.[0])).toMatch(
      /status = case[\s\S]*else 'removed'/
    );
    expect(getSqlText(execute.mock.calls[3]?.[0])).toMatch(
      /status_reason = case[\s\S]*subscription_inactive/
    );
  });

  it("marks paused subscriptions as removed access by subscription inactivity", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            existing_operation_id: null,
            subscription_found: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ operation_inserted: "operation-1" }] })
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

    expect(getSqlText(execute.mock.calls[3]?.[0])).toMatch(
      /status = case[\s\S]*else 'removed'/
    );
    expect(getSqlText(execute.mock.calls[3]?.[0])).toMatch(
      /status_reason = case[\s\S]*subscription_inactive/
    );
  });

  it("refreshes expired Mercado Pago tokens before reconciling webhooks", async () => {
    const expiredTokenDate = new Date(Date.now() - 60_000).toISOString();
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "expired-access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            existing_operation_id: null,
            refresh_token: "refresh-token",
            subscription_found: true,
            token_expires_at: expiredTokenDate,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ operation_inserted: "operation-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const getMercadoPagoPreapprovalStatus = jest.fn(async () => "authorized");
    const refreshMercadoPagoAccessToken = jest.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "seller-1",
      refreshToken: "new-refresh-token",
    }));
    const repository = createRepository(
      execute,
      jest.fn(),
      getMercadoPagoPreapprovalStatus,
      jest.fn(),
      jest.fn(() => "https://tutribu.example.com"),
      refreshMercadoPagoAccessToken
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

    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith("refresh-token");
    expect(getMercadoPagoPreapprovalStatus).toHaveBeenCalledWith({
      accessToken: "fresh-access-token",
      preapprovalId: "preapproval-1",
    });
    expect(getSqlText(execute.mock.calls[1]?.[0])).toMatch(
      /update public\.tribe_payment_integrations/
    );
    expect(getSqlText(execute.mock.calls[1]?.[0])).toMatch(
      /set_config\([\s\S]*app\.subscription_checkout_tribe_id/
    );
  });

  it("reconciles membership status against any current paid subscription", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            existing_operation_id: null,
            subscription_found: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ operation_inserted: "operation-1" }] })
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
        resourceId: "old-preapproval",
        topic: "subscription_preapproval.updated",
      })
    ).resolves.toEqual({
      status: "processed",
    });

    const membershipUpdateSql = getSqlText(execute.mock.calls[3]?.[0]);

    expect(membershipUpdateSql).toMatch(
      /where tribe_member_subscriptions\.tribe_id = tribe_members\.tribe_id[\s\S]*tribe_member_subscriptions\.user_id = tribe_members\.user_id[\s\S]*tribe_member_subscriptions\.status = .*active/
    );
    expect(membershipUpdateSql).toMatch(
      /where exists \([\s\S]*tribe_member_subscriptions\.mercado_pago_preapproval_id =/
    );
    expect(membershipUpdateSql).toMatch(
      /and not \([\s\S]*tribe_members\.status = 'blocked'[\s\S]*tribe_members\.status_reason <>/
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

  it("keeps webhooks retryable when the provider token cannot be resolved", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "expired-access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
          existing_operation_id: null,
          refresh_token: null,
          subscription_found: true,
          token_expires_at: new Date(Date.now() - 60_000).toISOString(),
          tribe_id: "tribe-1",
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
      status: "retryable_webhook",
    });

    expect(getMercadoPagoPreapprovalStatus).not.toHaveBeenCalled();
    expect(getSqlText(execute.mock.calls[0]?.[0])).not.toMatch(
      /insert into public\.subscription_idempotency_operations/
    );
  });

  it("does not call the provider again for duplicate webhook events", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
          existing_operation_id: "operation-1",
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

  it("keeps paused provider subscriptions eligible for current reconciliation", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: null,
          mercado_pago_preapproval_id: null,
          refresh_token: null,
          subscription_found: false,
          token_expires_at: null,
          tribe_id: "tribe-1",
        },
      ],
    });
    const repository = createRepository(execute);

    await expect(
      repository.reconcileCurrentMemberSubscription({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "not_found",
    });

    expect(getSqlText(execute.mock.calls[0]?.[0])).toMatch(
      /tribe_member_subscriptions\.status in \([\s\S]*paused/
    );
  });

  it("does not remove access when Mercado Pago does not confirm cancellation", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
          mercado_pago_preapproval_id: "preapproval-1",
          refresh_token: null,
          subscription_found: true,
          token_expires_at: null,
          tribe_id: "tribe-1",
        },
      ],
    });
    const updateMercadoPagoPreapprovalStatus = jest.fn(async () => "authorized");
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      updateMercadoPagoPreapprovalStatus
    );

    await expect(
      repository.cancelOwnSubscription({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "provider_unavailable",
    });

    expect(updateMercadoPagoPreapprovalStatus).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalId: "preapproval-1",
      status: "canceled",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
