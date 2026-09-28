/**
 * Decides the effect of a verified academy invoice on the payment ledger and
 * on the paid access grant. Pure and deterministic: the adapter reads the
 * invoice server-to-server, loads the local contract snapshot and the current
 * ledger row, and applies the decision in one transaction.
 *
 * Rules:
 * - the invoice must belong to the local subscription (same provider
 *   subscription id, read with the token of the subscription integration);
 * - amount and currency are checked against the contract snapshot, never
 *   against the current catalog price;
 * - an approved payment pays the monthly cycle of its scheduled debit date;
 *   an ambiguous cycle goes to reconciliation instead of improvising dates;
 * - a full refund or a chargeback is terminal: it revokes only the grant of
 *   that payment, and an older "approved" delivered later never resurrects it;
 * - a partial refund is recorded for manual review without prorating access;
 * - a stale update (older `last_modified` than the stored one) is ignored.
 *
 * @module academy-invoice-policy
 */

import { resolveMonthlyServiceInterval } from "@/src/modules/subscriptions/domain/services/monthly-billing-cycle";

export type AcademyLedgerPaymentStatus =
  | "approved"
  | "charged_back"
  | "needs_reconciliation"
  | "partially_refunded"
  | "pending"
  | "refunded"
  | "rejected";

export type VerifiedAcademyInvoice = {
  currencyId: string | null;
  debitDate: string | null;
  id: string;
  lastModified: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  paymentStatusDetail: string | null;
  preapprovalId: string | null;
  transactionAmount: number | null;
};

export type AcademyContractSnapshot = {
  amountCents: number;
  billingAnchorAt: Date | null;
  currency: string;
  providerSubscriptionId: string;
};

export type ExistingLedgerEntry = {
  paymentStatus: AcademyLedgerPaymentStatus;
  providerLastModifiedAt: Date | null;
};

export type AcademyInvoiceDecision =
  | { kind: "ignore"; reason: "not_owned" | "stale_update" | "terminal_state" }
  | {
      amountCents: number;
      billingAnchorAt: Date | null;
      grantAction: "create" | "none" | "revoke";
      kind: "record";
      ledgerStatus: AcademyLedgerPaymentStatus;
      providerLastModifiedAt: Date | null;
      reviewReason: string | null;
      serviceInterval: { endsAt: Date; startsAt: Date } | null;
    };

const CENTS_PER_UNIT = 100;
const TERMINAL_LEDGER_STATUSES = new Set<AcademyLedgerPaymentStatus>([
  "charged_back",
  "refunded",
]);
const PROVIDER_PAYMENT_STATUS = {
  approved: "approved",
  authorized: "authorized",
  cancelled: "cancelled",
  chargedBack: "charged_back",
  inMediation: "in_mediation",
  inProcess: "in_process",
  refunded: "refunded",
  rejected: "rejected",
} as const;
const PARTIALLY_REFUNDED_DETAIL = "partially_refunded";

export const ACADEMY_INVOICE_REVIEW_REASON = {
  ambiguousCycle: "ambiguous_cycle",
  amountMismatch: "amount_mismatch",
  missingDebitDate: "missing_debit_date",
  partialRefund: "partial_refund",
} as const;

function parseOptionalDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Maps the provider payment state of an invoice to the ledger vocabulary.
 *
 * @param invoice - Verified invoice.
 * @returns Ledger payment status.
 */
export function mapInvoicePaymentStatus(
  invoice: Pick<VerifiedAcademyInvoice, "paymentStatus" | "paymentStatusDetail">
): AcademyLedgerPaymentStatus {
  switch (invoice.paymentStatus) {
    case PROVIDER_PAYMENT_STATUS.approved:
      return invoice.paymentStatusDetail === PARTIALLY_REFUNDED_DETAIL
        ? "partially_refunded"
        : "approved";
    case PROVIDER_PAYMENT_STATUS.refunded:
      return "refunded";
    case PROVIDER_PAYMENT_STATUS.chargedBack:
      return "charged_back";
    case PROVIDER_PAYMENT_STATUS.rejected:
    case PROVIDER_PAYMENT_STATUS.cancelled:
      return "rejected";
    default:
      // No payment yet, in process, authorized or in mediation: not paid.
      return "pending";
  }
}

/**
 * Decides the ledger and grant effect of one verified invoice.
 *
 * @param input - Invoice, contract snapshot and current ledger entry.
 * @returns The decision to apply atomically.
 */
export function decideAcademyInvoiceEffect({
  contract,
  existing,
  invoice,
}: {
  contract: AcademyContractSnapshot;
  existing: ExistingLedgerEntry | null;
  invoice: VerifiedAcademyInvoice;
}): AcademyInvoiceDecision {
  if (invoice.preapprovalId !== contract.providerSubscriptionId) {
    return { kind: "ignore", reason: "not_owned" };
  }

  const providerLastModifiedAt = parseOptionalDate(invoice.lastModified);

  if (existing && TERMINAL_LEDGER_STATUSES.has(existing.paymentStatus)) {
    // A refund or chargeback already happened: nothing can resurrect it.
    return { kind: "ignore", reason: "terminal_state" };
  }

  if (
    existing?.providerLastModifiedAt &&
    providerLastModifiedAt &&
    providerLastModifiedAt.getTime() < existing.providerLastModifiedAt.getTime()
  ) {
    return { kind: "ignore", reason: "stale_update" };
  }

  const ledgerStatus = mapInvoicePaymentStatus(invoice);
  const amountCents = Math.round((invoice.transactionAmount ?? 0) * CENTS_PER_UNIT);
  const base = {
    amountCents,
    billingAnchorAt: contract.billingAnchorAt,
    kind: "record" as const,
    providerLastModifiedAt,
    serviceInterval: null,
  };

  if (ledgerStatus === "refunded" || ledgerStatus === "charged_back") {
    return { ...base, grantAction: "revoke", ledgerStatus, reviewReason: null };
  }

  if (ledgerStatus === "partially_refunded") {
    return {
      ...base,
      grantAction: "none",
      ledgerStatus,
      reviewReason: ACADEMY_INVOICE_REVIEW_REASON.partialRefund,
    };
  }

  if (ledgerStatus !== "approved") {
    // A rejection or a pending charge never extends access.
    return { ...base, grantAction: "none", ledgerStatus, reviewReason: null };
  }

  if (amountCents !== contract.amountCents || invoice.currencyId !== contract.currency) {
    return {
      ...base,
      grantAction: "none",
      ledgerStatus: "needs_reconciliation",
      reviewReason: ACADEMY_INVOICE_REVIEW_REASON.amountMismatch,
    };
  }

  const debitAt = parseOptionalDate(invoice.debitDate);

  if (!debitAt) {
    return {
      ...base,
      grantAction: "none",
      ledgerStatus: "needs_reconciliation",
      reviewReason: ACADEMY_INVOICE_REVIEW_REASON.missingDebitDate,
    };
  }

  // The first verified invoice anchors the monthly recurrence of the contract.
  const billingAnchorAt = contract.billingAnchorAt ?? debitAt;
  const interval = resolveMonthlyServiceInterval({ anchorAt: billingAnchorAt, debitAt });

  if (interval.status === "ambiguous") {
    return {
      ...base,
      grantAction: "none",
      ledgerStatus: "needs_reconciliation",
      reviewReason: ACADEMY_INVOICE_REVIEW_REASON.ambiguousCycle,
    };
  }

  return {
    ...base,
    billingAnchorAt,
    grantAction: "create",
    ledgerStatus,
    reviewReason: null,
    serviceInterval: { endsAt: interval.endsAt, startsAt: interval.startsAt },
  };
}
