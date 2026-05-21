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
  options: {
    buildMercadoPagoPlanCheckoutUrl?: jest.Mock;
    getMercadoPagoPreapprovalDetails?: jest.Mock;
    getMercadoPagoPreapprovalStatus?: jest.Mock;
    updateMercadoPagoPreapprovalStatus?: jest.Mock;
    refreshMercadoPagoAccessToken?: jest.Mock;
  } = {}
) {
  return new PostgresTribeMemberSubscriptionRepository(
    async (callback) => callback({ execute } as never),
    options.buildMercadoPagoPlanCheckoutUrl ??
      jest.fn(
        (preapprovalPlanId: string) =>
          "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=" +
          preapprovalPlanId
      ),
    options.getMercadoPagoPreapprovalDetails ?? jest.fn(),
    options.getMercadoPagoPreapprovalStatus ?? jest.fn(),
    options.updateMercadoPagoPreapprovalStatus ?? jest.fn(),
    options.refreshMercadoPagoAccessToken ?? jest.fn()
  );
}

const PROVIDER_PLAN_CHECKOUT_URL =
  "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=provider-plan-1";

const PREVIOUS_PROVIDER_PLAN_CHECKOUT_URL =
  "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=previous-provider-plan";

const PROVIDER_MEMBER_PREAPPROVAL_CHECKOUT_URL =
  "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=preapproval-1";

describe("PostgresTribeMemberSubscriptionRepository", () => {
  const previousBaseUrl = process.env.BETTER_AUTH_URL;

  beforeEach(() => {
    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";
  });

  afterAll(() => {
    if (previousBaseUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBaseUrl;
    }
  });

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

  it("resolves Mercado Pago return paths from stored provider subscription ids", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ tribe_slug: "matematica-pro" }],
    }));
    const repository = createRepository(execute);

    await expect(
      repository.resolveReturnPathByProviderSubscription({
        providerSubscriptionId: "preapproval-1",
      })
    ).resolves.toBe("/tribu/matematica-pro?preapproval_id=preapproval-1");

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toMatch(/tribe_member_subscriptions\.mercado_pago_preapproval_id =/);
    expect(sqlText).toMatch(/tribes\.slug/);
  });

  it("reads an already stored return status without calling Mercado Pago", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ status: "active" }],
    }));
    const getMercadoPagoPreapprovalStatus = jest.fn();
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

    await expect(
      repository.resolveSubscriptionReturn({
        providerSubscriptionId: "preapproval-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "active",
    });

    expect(getMercadoPagoPreapprovalStatus).not.toHaveBeenCalled();
    expect(getSqlText(execute.mock.calls[0]?.[0])).toMatch(
      /mercado_pago_preapproval_id =/
    );
  });

  it("attaches the returned Mercado Pago preapproval id to the pending plan checkout without activating access", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            mercado_pago_preapproval_id: null,
            refresh_token: null,
            subscription_found: false,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            refresh_token: null,
            reserved_subscription_id: "subscription-2",
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "subscription-2" }] })
      .mockResolvedValueOnce({ rows: [] });
    const getMercadoPagoPreapprovalStatus = jest.fn(async () => "authorized");
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

    await expect(
      repository.resolveSubscriptionReturn({
        providerSubscriptionId: "preapproval-2",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "pending",
    });

    expect(getMercadoPagoPreapprovalStatus).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalId: "preapproval-2",
    });
    expect(getSqlText(execute.mock.calls[2]?.[0])).toMatch(
      /mercado_pago_preapproval_id =/
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toMatch(
      /where tribe_member_subscriptions\.id =/
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toMatch(
      /status = .*pending/
    );
  });

  it("recovers a provider plan checkout return as pending when the local reservation is missing", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            mercado_pago_preapproval_id: null,
            refresh_token: null,
            subscription_found: false,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            refresh_token: null,
            reserved_subscription_id: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_id: "price-1",
            current_price_provider_plan_id: "provider-plan-1",
            has_recent_plan_checkout: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "subscription-2" }] })
      .mockResolvedValueOnce({ rows: [] });
    const getMercadoPagoPreapprovalDetails = jest.fn(async () => ({
      externalReference: "tutribu:price:price-1",
      id: "preapproval-2",
      preapprovalPlanId: "provider-plan-1",
      status: "authorized",
    }));
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalDetails,
    });

    await expect(
      repository.resolveSubscriptionReturn({
        providerSubscriptionId: "preapproval-2",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "pending",
    });

    expect(getMercadoPagoPreapprovalDetails).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalId: "preapproval-2",
    });
    expect(getSqlText(execute.mock.calls[2]?.[0])).toMatch(
      /subscription_idempotency_operations/
    );
    expect(getSqlText(execute.mock.calls[4]?.[0])).toMatch(
      /insert into public\.tribe_member_subscriptions/
    );
    expect(getSqlText(execute.mock.calls[4]?.[0])).toMatch(
      /mercado_pago_preapproval_id/
    );
    expect(getSqlText(execute.mock.calls[4]?.[0])).toMatch(/pending/);
  });

  it("does not recover a missing local reservation from a different provider plan", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            mercado_pago_preapproval_id: null,
            refresh_token: null,
            subscription_found: false,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            refresh_token: null,
            reserved_subscription_id: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_id: "price-1",
            current_price_provider_plan_id: "provider-plan-1",
            has_recent_plan_checkout: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      });
    const getMercadoPagoPreapprovalDetails = jest.fn(async () => ({
      externalReference: "tutribu:price:other-price",
      id: "preapproval-2",
      preapprovalPlanId: "other-provider-plan",
      status: "authorized",
    }));
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalDetails,
    });

    await expect(
      repository.resolveSubscriptionReturn({
        providerSubscriptionId: "preapproval-2",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "not_found",
    });

    expect(getMercadoPagoPreapprovalDetails).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalId: "preapproval-2",
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("reuses an existing pending plan checkout without creating a member preapproval", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
            current_price_amount_cents: 1500,
          current_price_currency: "ARS",
          current_price_id: "price-1",
          current_price_plan_id: "plan-1",
          current_price_name: "Plan mensual",
          current_price_provider_plan_id: "provider-plan-1",
          current_user_email: "member@example.com",
          existing_checkout_url: PROVIDER_PLAN_CHECKOUT_URL,
          existing_provider_subscription_id: null,
          existing_membership_status: "blocked",
          existing_membership_status_reason: "payment_blocked",
          has_active_invitation: true,
          tribe_id: "tribe-1",
        },
      ],
    });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: "pending",
    });

    expect(getSqlText(execute.mock.calls[0]?.[0])).toMatch(
      /tribe_member_subscriptions\.status = .*pending/
    );
    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
  });

  it("replaces pending plan checkout URLs when they target an old provider plan", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
          current_price_amount_cents: 1500,
          current_price_currency: "ARS",
          current_price_id: "price-1",
          current_price_name: "Plan mensual",
          current_price_provider_plan_id: "provider-plan-1",
          current_user_email: "member@example.com",
          existing_checkout_url: PREVIOUS_PROVIDER_PLAN_CHECKOUT_URL,
          existing_checkout_subscription_id: "subscription-1",
          existing_provider_subscription_id: null,
          existing_membership_status: "blocked",
          existing_membership_status_reason: "payment_blocked",
          has_active_invitation: true,
          tribe_id: "tribe-1",
        },
      ],
    }).mockResolvedValueOnce({ rows: [] });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "retry-current-plan",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: "pending",
    });

    expect(buildMercadoPagoPlanCheckoutUrl).toHaveBeenCalledWith(
      "provider-plan-1"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toMatch(
      /on conflict \(operation_key\) do update[\s\S]*response_body = excluded\.response_body/
    );
  });

  it("replaces legacy member preapproval checkout URLs with provider plan checkouts", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
          current_price_amount_cents: 1500,
          current_price_currency: "ARS",
          current_price_id: "price-1",
          current_price_plan_id: "plan-1",
          current_price_name: "Plan mensual",
          current_price_provider_plan_id: "provider-plan-1",
          current_user_email: "member@example.com",
          existing_checkout_url: PROVIDER_MEMBER_PREAPPROVAL_CHECKOUT_URL,
          existing_checkout_subscription_id: "subscription-1",
          existing_provider_subscription_id: "preapproval-1",
          existing_membership_status: "blocked",
          existing_membership_status_reason: "payment_blocked",
          has_active_invitation: true,
          tribe_id: "tribe-1",
        },
      ],
    }).mockResolvedValueOnce({ rows: [] });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: "pending",
    });

    expect(buildMercadoPagoPlanCheckoutUrl).toHaveBeenCalledWith(
      "provider-plan-1"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "start_member_subscription"
    );
  });

  it("starts a provider plan checkout when no pending local subscription still exists", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_name: "Plan mensual",
            current_price_provider_plan_id: "provider-plan-1",
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
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: "pending",
    });

    expect(buildMercadoPagoPlanCheckoutUrl).toHaveBeenCalledWith(
      "provider-plan-1"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).not.toMatch(
      /mercado_pago_preapproval_id\s*=/
    );
  });

  it("short-circuits with alreadySubscribed and reconciles membership when the member already has a live provider subscription", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_name: "Plan mensual",
            current_price_provider_plan_id: "provider-plan-1",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_live_provider_subscription_id: "preapproval-live-1",
            existing_membership_status: "blocked",
            existing_membership_status_reason: "payment_blocked",
            has_active_invitation: true,
            has_retry_blocking_member_subscription: true,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "already_subscribed",
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();

    const contextSql = getSqlText(execute.mock.calls[0]?.[0]);
    const reconcileSql = getSqlText(execute.mock.calls[1]?.[0]);

    expect(contextSql).toMatch(/existing_live_subscription/);
    expect(contextSql).toMatch(/tribe_member_subscriptions\.status in \([\s\S]*active/);
    expect(contextSql).not.toMatch(/existing_live_subscription[\s\S]*grace_period/);
    expect(contextSql).not.toMatch(/existing_live_subscription[\s\S]*past_due/);
    expect(contextSql).not.toMatch(/existing_live_subscription[\s\S]*paused/);
    expect(reconcileSql).toMatch(/update public\.tribe_members/);
    expect(reconcileSql).toMatch(
      /mercado_pago_preapproval_id = .*preapproval-live-1/
    );
  });

  it("short-circuits direct retries with alreadySubscribed when the member already has a live provider subscription", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_name: "Plan mensual",
            current_price_provider_plan_id: "provider-plan-1",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_live_provider_subscription_id: "preapproval-live-1",
            existing_membership_status: "blocked",
            existing_membership_status_reason: "payment_blocked",
            has_active_invitation: false,
            has_retry_blocking_member_subscription: true,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.retryCurrentPriceSubscriptionPayment({
        idempotencyKey: "retry-attempt",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "already_subscribed",
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
    expect(getSqlText(execute.mock.calls[1]?.[0])).toMatch(
      /mercado_pago_preapproval_id = .*preapproval-live-1/
    );
  });

  it("keeps conduct_blocked precedence over alreadySubscribed when the member is banned", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
          current_price_amount_cents: 1500,
          current_price_currency: "ARS",
          current_price_id: "price-1",
          current_price_name: "Plan mensual",
          current_price_provider_plan_id: "provider-plan-1",
          current_user_email: "member@example.com",
          existing_checkout_url: null,
          existing_live_provider_subscription_id: "preapproval-live-1",
          existing_membership_status: "blocked",
          existing_membership_status_reason: "conduct_blocked",
          has_active_invitation: true,
          has_retry_blocking_member_subscription: true,
          tribe_id: "tribe-1",
        },
      ],
    });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "banned-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "conduct_blocked",
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
  });

  it("starts direct payment retry for payment-blocked members", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_name: "Plan mensual",
            current_price_provider_plan_id: "provider-plan-1",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_membership_status: "blocked",
            existing_membership_status_reason: "payment_blocked",
            has_active_invitation: false,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ checkout_url: null, reserved_subscription_id: "subscription-2" }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.retryCurrentPriceSubscriptionPayment({
        idempotencyKey: "retry-payment",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: "pending",
    });

    expect(buildMercadoPagoPlanCheckoutUrl).toHaveBeenCalledWith(
      "provider-plan-1"
    );
  });

  it("allows removed subscription-inactive members to retry payment directly", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_name: "Plan mensual",
            current_price_provider_plan_id: "provider-plan-1",
            current_user_email: "member@example.com",
            existing_checkout_url: null,
            existing_membership_status: "removed",
            existing_membership_status_reason: "subscription_inactive",
            has_retry_blocking_member_subscription: false,
            has_active_invitation: false,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ checkout_url: null, reserved_subscription_id: "subscription-2" }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.retryCurrentPriceSubscriptionPayment({
        idempotencyKey: "retry-payment",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: "pending",
    });

    expect(buildMercadoPagoPlanCheckoutUrl).toHaveBeenCalledWith(
      "provider-plan-1"
    );
  });

  it("rejects direct payment retry for paused subscriptions without changing membership", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
          current_price_amount_cents: 1500,
          current_price_currency: "ARS",
          current_price_id: "price-1",
          current_price_name: "Plan mensual",
          current_price_provider_plan_id: "provider-plan-1",
          current_user_email: "member@example.com",
          existing_checkout_url: null,
          existing_membership_status: "removed",
          existing_membership_status_reason: "subscription_inactive",
          has_retry_blocking_member_subscription: true,
          has_active_invitation: false,
          tribe_id: "tribe-1",
        },
      ],
    });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.retryCurrentPriceSubscriptionPayment({
        idempotencyKey: "retry-payment",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "payment_blocked",
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
  });

  it("rejects direct payment retry for conduct-blocked members", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          access_token: "access-token",
          current_price_amount_cents: 1500,
          current_price_currency: "ARS",
          current_price_id: "price-1",
          current_price_name: "Plan mensual",
          current_price_provider_plan_id: "provider-plan-1",
          current_user_email: "member@example.com",
          existing_checkout_url: null,
          existing_membership_status: "blocked",
          existing_membership_status_reason: "conduct_blocked",
          has_active_invitation: false,
          tribe_id: "tribe-1",
        },
      ],
    });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.retryCurrentPriceSubscriptionPayment({
        idempotencyKey: "retry-payment",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "conduct_blocked",
    });

    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
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
            current_price_name: "Plan mensual",
            current_price_provider_plan_id: "provider-plan-1",
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
      .mockResolvedValueOnce({ rows: [] });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "removed-member-retry",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: "pending",
    });

    const reservationSql = getSqlText(execute.mock.calls[1]?.[0]);
    const membershipPersistenceSql = getSqlText(execute.mock.calls[2]?.[0]);

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
          current_price_provider_plan_id: "provider-plan-1",
          current_user_email: "member@example.com",
          existing_checkout_url: null,
          existing_membership_status: "blocked",
          existing_membership_status_reason: "conduct_blocked",
          has_active_invitation: true,
          tribe_id: "tribe-1",
        },
      ],
    });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

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
    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
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
            current_price_provider_plan_id: "provider-plan-1",
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
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "racing-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "payment_blocked",
    });

    expect(getSqlText(execute.mock.calls[1]?.[0])).toMatch(
      /insert into public\.tribe_member_subscriptions/
    );
    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
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
            current_price_provider_plan_id: "provider-plan-1",
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
      .mockResolvedValueOnce({ rows: [] });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "recovered-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: "pending",
    });

    const reservationSql = getSqlText(execute.mock.calls[1]?.[0]);

    expect(reservationSql).toMatch(/existing_recoverable_reservation/);
    expect(reservationSql).toMatch(/mercado_pago_preapproval_id is null/);
    expect(reservationSql).toMatch(/5 minutes/);
    expect(buildMercadoPagoPlanCheckoutUrl).toHaveBeenCalledWith(
      "provider-plan-1"
    );
  });

  it("starts provider plan checkouts without refreshing expired Mercado Pago tokens", async () => {
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
            current_price_provider_plan_id: "provider-plan-1",
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
      .mockResolvedValueOnce({
        rows: [{ checkout_url: null, reserved_subscription_id: "subscription-2" }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const refreshMercadoPagoAccessToken = jest.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "seller-1",
      refreshToken: "new-refresh-token",
    }));
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
      refreshMercadoPagoAccessToken,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: "pending",
    });

    expect(refreshMercadoPagoAccessToken).not.toHaveBeenCalled();
    expect(buildMercadoPagoPlanCheckoutUrl).toHaveBeenCalledWith(
      "provider-plan-1"
    );
  });

  it("stores the plan checkout before redirecting to Mercado Pago", async () => {
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
            current_price_provider_plan_id: "provider-plan-1",
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
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "retryable-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: "pending",
    });

    expect(getSqlText(execute.mock.calls[2]?.[0])).toMatch(
      /insert into public\.tribe_members/
    );
    expect(getSqlText(execute.mock.calls[3]?.[0])).toMatch(
      /start_member_subscription/
    );
    expect(getSqlText(execute.mock.calls[3]?.[0])).toMatch(
      /preapproval_plan_id/
    );
  });

  it("rejects checkout starts when no local subscription can be reserved", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            current_price_amount_cents: 1500,
            current_price_currency: "ARS",
            current_price_id: "price-1",
            current_price_name: "Plan mensual",
            current_price_provider_plan_id: "provider-plan-1",
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
        rows: [{ checkout_url: null, reserved_subscription_id: null }],
      });
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "retryable-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "payment_blocked",
    });

    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
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
          current_price_provider_plan_id: "provider-plan-1",
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
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "revoked-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "invalid_invitation",
    });

    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
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
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

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

  it("processes verified webhooks with the RLS-safe subscription context", async () => {
    const execute = jest.fn(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("with subscription_context")) {
        return sqlText.includes("inner join public.tribes")
          ? {
              rows: [
                {
                  access_token: null,
                  subscription_found: false,
                },
              ],
            }
          : {
              rows: [
                {
                  access_token: "access-token",
                  existing_operation_id: null,
                  price_id: "price-1",
                  subscription_found: true,
                  tribe_id: "tribe-1",
                },
              ],
            };
      }

      if (sqlText.includes("insert into public.subscription_idempotency_operations")) {
        return { rows: [{ operation_inserted: "operation-1" }] };
      }

      return { rows: [] };
    });
    const getMercadoPagoPreapprovalStatus = jest.fn(async () => "authorized");
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

    await expect(
      repository.handleWebhook({
        eventId: "event-1",
        resourceId: "preapproval-1",
        topic: "subscription_preapproval.updated",
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
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

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
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

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
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
      refreshMercadoPagoAccessToken,
    });

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
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

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
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

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
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

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
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

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

  it("returns paused when current reconciliation finds a paused provider subscription", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            mercado_pago_preapproval_id: "preapproval-1",
            price_id: "price-1",
            refresh_token: null,
            subscription_found: true,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const getMercadoPagoPreapprovalStatus = jest.fn(async () => "paused");
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

    await expect(
      repository.reconcileCurrentMemberSubscription({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "paused",
    });

    expect(getMercadoPagoPreapprovalStatus).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalId: "preapproval-1",
    });
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
    const repository = createRepository(execute, {
      updateMercadoPagoPreapprovalStatus,
    });

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
