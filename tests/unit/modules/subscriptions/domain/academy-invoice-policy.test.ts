import { describe, expect, it } from "vitest";

import {
  decideAcademyInvoiceEffect,
  mergeAcademyInvoicePaymentState,
  type AcademyContractSnapshot,
  type VerifiedAcademyInvoice,
} from "@/src/modules/subscriptions/domain/services/academy-invoice-policy";

const contract: AcademyContractSnapshot = {
  amountCents: 1_500_000,
  billingAnchorAt: new Date("2026-01-31T15:30:00.000Z"),
  currency: "ARS",
  providerSubscriptionId: "preapproval-synthetic-1",
};

function invoice(overrides: Partial<VerifiedAcademyInvoice> = {}): VerifiedAcademyInvoice {
  return {
    currencyId: "ARS",
    debitDate: "2026-02-28T15:30:00.000Z",
    id: "invoice-synthetic-1",
    lastModified: "2026-02-28T16:00:00.000Z",
    paymentId: "payment-synthetic-1",
    paymentStatus: "approved",
    paymentStatusDetail: "accredited",
    preapprovalId: "preapproval-synthetic-1",
    transactionAmount: 15_000,
    ...overrides,
  };
}

describe("decideAcademyInvoiceEffect", () => {
  it("should revoke a payment refunded before the invoice state catches up", () => {
    const updatedInvoice = mergeAcademyInvoicePaymentState(invoice(), {
      lastModified: "2026-02-28T17:00:00.000Z", status: "refunded", statusDetail: "refunded",
    });
    expect(decideAcademyInvoiceEffect({ contract, existing: null, invoice: updatedInvoice }))
      .toMatchObject({ ledgerStatus: "refunded", grantAction: "revoke", providerLastModifiedAt: new Date("2026-02-28T17:00:00.000Z") });
  });

  it("should retain a terminal invoice state when Payments still reports approved", () => {
    const updatedInvoice = mergeAcademyInvoicePaymentState(invoice({ paymentStatus: "refunded", paymentStatusDetail: "refunded" }), {
      lastModified: "2026-02-28T17:00:00.000Z", status: "approved", statusDetail: "accredited",
    });
    expect(decideAcademyInvoiceEffect({ contract, existing: null, invoice: updatedInvoice }))
      .toMatchObject({ ledgerStatus: "refunded", grantAction: "revoke" });
  });

  it("should retain the most recent provider revision and review a partial refund", () => {
    const updatedInvoice = mergeAcademyInvoicePaymentState(invoice(), {
      lastModified: "2026-02-28T15:00:00.000Z", status: "approved", statusDetail: "partially_refunded",
    });
    expect(decideAcademyInvoiceEffect({ contract, existing: null, invoice: updatedInvoice }))
      .toMatchObject({ ledgerStatus: "partially_refunded", grantAction: "none", providerLastModifiedAt: new Date("2026-02-28T16:00:00.000Z") });
  });

  it("grants the invoice cycle from the scheduled debit date (AC-25)", () => {
    expect(decideAcademyInvoiceEffect({ contract, existing: null, invoice: invoice() })).toMatchObject({
      grantAction: "create",
      ledgerStatus: "approved",
      serviceInterval: {
        endsAt: new Date("2026-03-31T15:30:00.000Z"),
        startsAt: new Date("2026-02-28T15:30:00.000Z"),
      },
    });
  });

  it("anchors the first invoice of a contract on its own debit date", () => {
    const decision = decideAcademyInvoiceEffect({
      contract: { ...contract, billingAnchorAt: null },
      existing: null,
      invoice: invoice({ debitDate: "2026-05-10T12:00:00.000Z" }),
    });

    expect(decision).toMatchObject({
      billingAnchorAt: new Date("2026-05-10T12:00:00.000Z"),
      serviceInterval: {
        endsAt: new Date("2026-06-10T12:00:00.000Z"),
        startsAt: new Date("2026-05-10T12:00:00.000Z"),
      },
    });
  });

  it("does not invent paid coverage for an unpaid or rejected invoice (AC-15, AC-22)", () => {
    for (const paymentStatus of [null, "in_process", "rejected", "cancelled"]) {
      expect(
        decideAcademyInvoiceEffect({ contract, existing: null, invoice: invoice({ paymentStatus }) })
      ).toMatchObject({ grantAction: "none", serviceInterval: null });
    }
  });

  it("ignores an invoice of another subscription or account (AC-17, AC-36)", () => {
    expect(
      decideAcademyInvoiceEffect({
        contract,
        existing: null,
        invoice: invoice({ preapprovalId: "preapproval-of-someone-else" }),
      })
    ).toEqual({ kind: "ignore", reason: "not_owned" });
  });

  it("validates amount and currency against the contract snapshot (AC-23)", () => {
    expect(
      decideAcademyInvoiceEffect({
        contract,
        existing: null,
        invoice: invoice({ transactionAmount: 20_000 }),
      })
    ).toMatchObject({
      grantAction: "none",
      ledgerStatus: "needs_reconciliation",
      reviewReason: "amount_mismatch",
    });
    expect(
      decideAcademyInvoiceEffect({ contract, existing: null, invoice: invoice({ currencyId: "USD" }) })
    ).toMatchObject({ ledgerStatus: "needs_reconciliation" });
  });

  it("sends an invoice outside the recurrence to reconciliation", () => {
    expect(
      decideAcademyInvoiceEffect({
        contract,
        existing: null,
        invoice: invoice({ debitDate: "2026-02-14T00:00:00.000Z" }),
      })
    ).toMatchObject({ ledgerStatus: "needs_reconciliation", reviewReason: "ambiguous_cycle" });
  });

  it("revokes only the refunded payment grant and never resurrects it (AC-20)", () => {
    const refund = decideAcademyInvoiceEffect({
      contract,
      existing: { paymentStatus: "approved", providerLastModifiedAt: new Date("2026-02-28T16:00:00.000Z") },
      invoice: invoice({ lastModified: "2026-03-05T10:00:00.000Z", paymentStatus: "refunded" }),
    });

    expect(refund).toMatchObject({ grantAction: "revoke", ledgerStatus: "refunded" });
    expect(
      decideAcademyInvoiceEffect({
        contract,
        existing: { paymentStatus: "refunded", providerLastModifiedAt: new Date("2026-03-05T10:00:00.000Z") },
        invoice: invoice({ lastModified: "2026-03-06T10:00:00.000Z" }),
      })
    ).toEqual({ kind: "ignore", reason: "terminal_state" });
  });

  it("processes a legitimate refund even after the approval was applied", () => {
    expect(
      decideAcademyInvoiceEffect({
        contract,
        existing: { paymentStatus: "approved", providerLastModifiedAt: null },
        invoice: invoice({ paymentStatus: "charged_back" }),
      })
    ).toMatchObject({ grantAction: "revoke", ledgerStatus: "charged_back" });
  });

  it("ignores a stale update older than the stored one", () => {
    expect(
      decideAcademyInvoiceEffect({
        contract,
        existing: { paymentStatus: "pending", providerLastModifiedAt: new Date("2026-03-01T00:00:00.000Z") },
        invoice: invoice({ lastModified: "2026-02-28T00:00:00.000Z" }),
      })
    ).toEqual({ kind: "ignore", reason: "stale_update" });
  });

  it("records a partial refund for review without prorating access", () => {
    expect(
      decideAcademyInvoiceEffect({
        contract,
        existing: { paymentStatus: "approved", providerLastModifiedAt: null },
        invoice: invoice({ paymentStatusDetail: "partially_refunded" }),
      })
    ).toMatchObject({
      grantAction: "none",
      ledgerStatus: "partially_refunded",
      reviewReason: "partial_refund",
    });
  });
});
