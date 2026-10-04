/** Exercises checkout creation and recovery against an explicitly isolated Postgres branch. */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { runWithGuardedTransaction, type RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { insertAcademyGrantWithEnrollment, recordAcademyAuditEvent } from "@/src/modules/product-access/infrastructure/repositories/academy-access-sql";
import { PostgresAcademySubscriptionRepository, type AcademySubscriptionGateway } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-academy-subscription-repository";
import { MercadoPagoRequestError } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";

const validationDatabaseUrl = process.env.ACADEMY_VALIDATION_DATABASE_URL;
const validationDatabaseHost = process.env.ACADEMY_VALIDATION_DATABASE_HOST;

describe.skipIf(!validationDatabaseUrl)("academy checkout provider creation", () => {
  let pool: ReturnType<typeof createPostgresPool>;
  let tribeId: string;
  let memberId: string;
  let leaderId: string;
  let tribeSlug: string;
  const previousBaseUrl = process.env.BETTER_AUTH_URL;

  beforeAll(() => {
    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";
    if (!validationDatabaseHost || new URL(validationDatabaseUrl!).hostname !== validationDatabaseHost ||
      process.env.ACADEMY_VALIDATION_IS_EPHEMERAL !== "true") {
      throw new Error("Academy integration tests require an explicitly provisioned ephemeral database host.");
    }
    pool = createPostgresPool({ connectionString: validationDatabaseUrl!, operation: "academy-checkout-validation" });
  });

  beforeEach(async () => {
    tribeId = randomUUID();
    memberId = `checkout-member-${randomUUID()}`;
    leaderId = `checkout-leader-${randomUUID()}`;
    tribeSlug = `checkout-${randomUUID()}`;
    await pool.query('insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values($1,$2,$3,true,now(),now()),($4,$5,$6,true,now(),now())',
      [memberId, "Integrante ficticio", `${memberId}@example.com`, leaderId, "Líder ficticio", `${leaderId}@example.com`]);
    await pool.query("insert into public.tribes(id,name,slug,created_by) values($1,$2,$3,$4)", [tribeId, "Tribu ficticia", tribeSlug, leaderId]);
    await pool.query("insert into public.tribe_members(tribe_id,user_id,role,status) values($1,$2,'tribemate','active'),($1,$3,'leader','active')", [tribeId, memberId, leaderId]);
    await pool.query("insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled,sales_enabled) values($1,'academy',true,true)", [tribeId]);
    const integration = await pool.query("insert into public.tribe_payment_integrations(tribe_id,provider,provider_account_id,access_token,connected_by,account_label) values($1,'mercado_pago','synthetic-seller','synthetic-token',$2,'Cuenta ficticia') returning id", [tribeId, leaderId]);
    await pool.query("insert into public.tribe_subscription_prices(tribe_id,name,amount_cents,currency,frequency,status,is_current,mercado_pago_preapproval_plan_id,created_by,payment_integration_id,product_key) values($1,'Academia ficticia',3000,'ARS','monthly','active',true,'synthetic-plan',$2,$3,'academy')", [tribeId, leaderId, integration.rows[0].id]);
    const provider = await pool.query("insert into public.verification_providers(tribe_id,key,display_name,created_by) values($1,'synthetic-provider','Proveedor ficticio',$2) returning id", [tribeId, leaderId]);
    await pool.query("insert into public.member_verifications(tribe_id,user_id,provider_id,status) values($1,$2,$3,'verified')", [tribeId, memberId, provider.rows[0].id]);
  });

  afterEach(async () => {
    await pool.query("delete from public.tribes where id=$1", [tribeId]);
    await pool.query('delete from public."user" where id=any($1)', [[memberId, leaderId]]);
  });

  afterAll(async () => {
    await pool?.end();
    if (previousBaseUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previousBaseUrl;
  });

  /** Runs the real adapter with a member-scoped transaction and an external provider double. */
  function buildRepository(gateway: AcademySubscriptionGateway) {
    const execute = <Result>(work: (database: RequestDatabase) => Promise<Result>) =>
      runWithGuardedTransaction(pool, work, async (database) => {
        await database.execute(sql`select set_config('app.current_user_id', ${memberId}, true)`);
      });
    return new PostgresAcademySubscriptionRepository(execute, gateway, insertAcademyGrantWithEnrollment, recordAcademyAuditEvent);
  }

  /** Builds a provider port whose unused operations fail instead of hiding an unexpected call. */
  function buildGateway(overrides: Partial<AcademySubscriptionGateway>): AcademySubscriptionGateway {
    const unused = async () => { throw new Error("Unexpected provider operation in checkout validation"); };
    return {
      cancelPreapproval: unused,
      createPreapproval: unused,
      findCheckoutByReference: async () => null,
      getAuthorizedPayment: unused,
      getPreapprovalStatus: unused,
      refreshAccessToken: unused,
      searchAuthorizedPayments: unused,
      ...overrides,
    };
  }

  it("should create only one provider subscription when checkout requests overlap", async () => {
    let creationCount = 0;
    let releaseCreation: () => void = () => {};
    let notifyFirstCreation: () => void = () => {};
    let notifySecondRequest: () => void = () => {};
    const creationGate = new Promise<void>((resolve) => { releaseCreation = resolve; });
    const firstCreation = new Promise<void>((resolve) => { notifyFirstCreation = resolve; });
    const secondRequest = new Promise<void>((resolve) => { notifySecondRequest = resolve; });
    const repository = buildRepository(buildGateway({
      createPreapproval: async () => {
        creationCount += 1;
        const providerSubscriptionId = `synthetic-provider-${creationCount}`;
        notifyFirstCreation();
        if (creationCount > 1) notifySecondRequest();
        await creationGate;
        return { providerSubscriptionId, checkoutUrl: `https://checkout.example/${providerSubscriptionId}` };
      },
      findCheckoutByReference: async () => { notifySecondRequest(); return null; },
    }));
    const command = { acceptedOfferVersion: 1, correlationId: randomUUID(), tribeSlug };
    const first = repository.startCheckout(command);
    void first.then(notifyFirstCreation, notifyFirstCreation);
    await firstCreation;
    const second = repository.startCheckout(command);
    void second.then(notifySecondRequest, notifySecondRequest);
    await secondRequest;
    releaseCreation();
    const results = await Promise.all([first, second]);
    expect(results[0].status).toBe("redirect");
    expect(creationCount).toBe(1);
    expect(results[0].status).toBe("redirect");
    expect(["redirect", "checkout_unresolved"]).toContain(results[1].status);
    const subscriptions = await pool.query("select mercado_pago_preapproval_id from public.tribe_member_subscriptions where tribe_id=$1 and user_id=$2", [tribeId, memberId]);
    expect(subscriptions.rows).toEqual([{ mercado_pago_preapproval_id: "synthetic-provider-1" }]);
  });

  it("should recover a created subscription after an ambiguous failure without creating again", async () => {
    const recovered = { providerSubscriptionId: "synthetic-recovered", checkoutUrl: "https://checkout.example/recovered" };
    const create = vi.fn(async () => { throw new Error("The provider accepted creation but the response timed out"); });
    const repository = buildRepository(buildGateway({ createPreapproval: create, findCheckoutByReference: async () => recovered }));
    const command = { acceptedOfferVersion: 1, correlationId: randomUUID(), tribeSlug };
    expect(await repository.startCheckout(command)).toEqual({ status: "checkout_unresolved" });
    expect(await repository.startCheckout(command)).toEqual({ checkoutUrl: recovered.checkoutUrl, status: "redirect" });
    expect(create).toHaveBeenCalledTimes(1);
    const subscriptions = await pool.query("select mercado_pago_preapproval_id from public.tribe_member_subscriptions where tribe_id=$1 and user_id=$2", [tribeId, memberId]);
    expect(subscriptions.rows).toEqual([{ mercado_pago_preapproval_id: "synthetic-recovered" }]);
  });

  it("should permit a corrected retry after a definite provider rejection", async () => {
    const create = vi.fn().mockRejectedValueOnce(new MercadoPagoRequestError("Invalid request", 400, "create-checkout"))
      .mockResolvedValue({ providerSubscriptionId: "synthetic-corrected", checkoutUrl: "https://checkout.example/corrected" });
    const repository = buildRepository(buildGateway({ createPreapproval: create }));
    const command = { acceptedOfferVersion: 1, correlationId: randomUUID(), tribeSlug };
    expect(await repository.startCheckout(command)).toEqual({ status: "provider_unavailable" });
    expect(await repository.startCheckout(command)).toEqual({ status: "redirect", checkoutUrl: "https://checkout.example/corrected" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("should retain the creation claim while provider recovery is unavailable", async () => {
    const create = vi.fn(async () => { throw new Error("Connection lost"); });
    const repository = buildRepository(buildGateway({ createPreapproval: create, findCheckoutByReference: async () => { throw new Error("Search unavailable"); } }));
    const command = { acceptedOfferVersion: 1, correlationId: randomUUID(), tribeSlug };
    expect(await repository.startCheckout(command)).toEqual({ status: "checkout_unresolved" });
    expect(await repository.startCheckout(command)).toEqual({ status: "checkout_unresolved" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("should reconcile a verified invoice notification without a seller user id", async () => {
    const debitDate = new Date().toISOString();
    const invoice = { id: "synthetic-invoice", preapprovalId: "synthetic-notified", currencyId: "ARS", debitDate,
      lastModified: debitDate, paymentId: "synthetic-payment", paymentStatus: "approved", paymentStatusDetail: "accredited",
      status: "processed", transactionAmount: 30 };
    const repository = buildRepository(buildGateway({
      createPreapproval: async () => ({ providerSubscriptionId: "synthetic-notified", checkoutUrl: "https://checkout.example/notified" }),
      getAuthorizedPayment: async ({ accessToken }) => accessToken === "synthetic-token" ? invoice : null,
      searchAuthorizedPayments: async () => [invoice],
      getPreapprovalStatus: async () => "authorized",
    }));
    await repository.startCheckout({ acceptedOfferVersion: 1, correlationId: randomUUID(), tribeSlug });
    expect(await repository.handleAuthorizedPaymentWebhook({ correlationId: randomUUID(), providerAccountId: null, resourceId: invoice.id }))
      .toEqual({ status: "processed" });
    const periods = await pool.query("select payment_status, grant_id is not null as has_grant from public.subscription_payment_periods where tribe_id=$1", [tribeId]);
    expect(periods.rows).toEqual([{ payment_status: "approved", has_grant: true }]);
  });

  it("should revoke only the refunded payment grant when a payment update arrives", async () => {
    const debitDate = new Date().toISOString();
    const approvedInvoice = { id: "synthetic-refund-invoice", preapprovalId: "synthetic-refundable", currencyId: "ARS", debitDate,
      lastModified: debitDate, paymentId: "synthetic-refund-payment", paymentStatus: "approved", paymentStatusDetail: "accredited",
      status: "processed", transactionAmount: 30 };
    let providerInvoice = approvedInvoice;
    const repository = buildRepository(buildGateway({
      createPreapproval: async () => ({ providerSubscriptionId: "synthetic-refundable", checkoutUrl: "https://checkout.example/refundable" }),
      searchAuthorizedPayments: async () => [providerInvoice], getPreapprovalStatus: async () => "authorized",
    }));
    await repository.startCheckout({ acceptedOfferVersion: 1, correlationId: randomUUID(), tribeSlug });
    expect(await repository.reconcileSubscriptionCoverage({ correlationId: randomUUID(), providerSubscriptionId: approvedInvoice.preapprovalId }))
      .toEqual({ appliedInvoices: 1, status: "reconciled" });

    providerInvoice = { ...approvedInvoice, lastModified: new Date(Date.now() + 1000).toISOString(), paymentStatus: "refunded", paymentStatusDetail: "refunded" };
    const command = { correlationId: randomUUID(), providerAccountId: "synthetic-seller", providerPaymentId: approvedInvoice.paymentId };
    expect(await repository.handlePaymentWebhook(command)).toEqual({ status: "processed" });
    providerInvoice = approvedInvoice;
    expect(await repository.handlePaymentWebhook(command)).toEqual({ status: "processed" });

    const grants = await pool.query("select p.payment_status,g.revoked_at is not null as revoked,m.status as membership_status from public.subscription_payment_periods p join public.member_access_grants g on g.id=p.grant_id join public.tribe_members m on m.tribe_id=p.tribe_id and m.user_id=p.user_id where p.tribe_id=$1", [tribeId]);
    expect(grants.rows).toEqual([{ payment_status: "refunded", revoked: true, membership_status: "active" }]);
  });

  it("should ignore a payment update outside the recorded seller integration", async () => {
    const debitDate = new Date().toISOString();
    const invoice = { id: "synthetic-owned-invoice", preapprovalId: "synthetic-owned", currencyId: "ARS", debitDate,
      lastModified: debitDate, paymentId: "synthetic-owned-payment", paymentStatus: "approved", paymentStatusDetail: "accredited",
      status: "processed", transactionAmount: 30 };
    const search = vi.fn(async () => [invoice]);
    const repository = buildRepository(buildGateway({
      createPreapproval: async () => ({ providerSubscriptionId: invoice.preapprovalId, checkoutUrl: "https://checkout.example/owned" }),
      searchAuthorizedPayments: search, getPreapprovalStatus: async () => "authorized",
    }));
    await repository.startCheckout({ acceptedOfferVersion: 1, correlationId: randomUUID(), tribeSlug });
    await repository.reconcileSubscriptionCoverage({ correlationId: randomUUID(), providerSubscriptionId: invoice.preapprovalId });
    search.mockClear();

    expect(await repository.handlePaymentWebhook({ correlationId: randomUUID(), providerAccountId: "unrelated-seller", providerPaymentId: invoice.paymentId }))
      .toEqual({ status: "ignored" });
    expect(search).not.toHaveBeenCalled();
    const grants = await pool.query("select revoked_at is not null as revoked from public.member_access_grants where tribe_id=$1", [tribeId]);
    expect(grants.rows).toEqual([{ revoked: false }]);
  });

  it("should preserve paid coverage and request redelivery when the provider is unavailable", async () => {
    const debitDate = new Date().toISOString();
    const invoice = { id: "synthetic-unavailable-invoice", preapprovalId: "synthetic-unavailable", currencyId: "ARS", debitDate,
      lastModified: debitDate, paymentId: "synthetic-unavailable-payment", paymentStatus: "approved", paymentStatusDetail: "accredited",
      status: "processed", transactionAmount: 30 };
    let providerUnavailable = false;
    const repository = buildRepository(buildGateway({
      createPreapproval: async () => ({ providerSubscriptionId: invoice.preapprovalId, checkoutUrl: "https://checkout.example/unavailable" }),
      searchAuthorizedPayments: async () => { if (providerUnavailable) throw new Error("Provider temporarily unavailable"); return [invoice]; },
      getPreapprovalStatus: async () => "authorized",
    }));
    await repository.startCheckout({ acceptedOfferVersion: 1, correlationId: randomUUID(), tribeSlug });
    await repository.reconcileSubscriptionCoverage({ correlationId: randomUUID(), providerSubscriptionId: invoice.preapprovalId });
    providerUnavailable = true;

    expect(await repository.handlePaymentWebhook({ correlationId: randomUUID(), providerAccountId: "synthetic-seller", providerPaymentId: invoice.paymentId }))
      .toEqual({ status: "retryable" });
    const periods = await pool.query("select p.payment_status,g.revoked_at is not null as revoked from public.subscription_payment_periods p join public.member_access_grants g on g.id=p.grant_id where p.tribe_id=$1", [tribeId]);
    expect(periods.rows).toEqual([{ payment_status: "approved", revoked: false }]);
  });

  it("should request redelivery when an invoice arrives before the checkout is linked", async () => {
    let releaseCreation: () => void = () => {};
    let notifyCreation: () => void = () => {};
    const creationGate = new Promise<void>((resolve) => { releaseCreation = resolve; });
    const creating = new Promise<void>((resolve) => { notifyCreation = resolve; });
    const repository = buildRepository(buildGateway({
      createPreapproval: async () => { notifyCreation(); await creationGate; return { providerSubscriptionId: "synthetic-early", checkoutUrl: "https://checkout.example/early" }; },
      getAuthorizedPayment: async ({ accessToken }) => accessToken === "synthetic-token" ? {
        id: "synthetic-early-invoice", preapprovalId: "synthetic-early", currencyId: "ARS", debitDate: null, lastModified: null,
        paymentId: null, paymentStatus: null, paymentStatusDetail: null, status: "scheduled", transactionAmount: 30,
      } : null,
    }));
    const checkout = repository.startCheckout({ acceptedOfferVersion: 1, correlationId: randomUUID(), tribeSlug });
    void checkout.then(notifyCreation, notifyCreation);
    await creating;
    try {
      expect(await repository.handleAuthorizedPaymentWebhook({ correlationId: randomUUID(), providerAccountId: null, resourceId: "synthetic-early-invoice" }))
        .toEqual({ status: "retryable" });
    } finally {
      releaseCreation();
      await checkout;
    }
  });
});
