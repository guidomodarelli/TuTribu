/** Names the leader's audited review of memberships blocked by payment whose recovery is unknown or privileged. @module commercial-membership-review-constants */
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS, TRIBE_MEMBERSHIP_STATUS_REASON } from "@/src/modules/tribes/constants/tribe-page-access";
import { ADMISSION_LIMIT } from "./admission-limits";

/** What happens prospectively when the payment is regularized; retiring is offered only to privileged memberships. */
export type CommercialMembershipDecision = "recover_active" | "recover_muted" | "retire";
export const COMMERCIAL_MEMBERSHIP_DECISION = { recoverActive: "recover_active", recoverMuted: "recover_muted", retire: "retire" } as const satisfies Record<string, CommercialMembershipDecision>;

/** Why a membership is listed: an unknown recovery state, or a guardian role that a payment can never restore. */
export type CommercialMembershipReviewKind = "unknown_history" | "privileged";
export const COMMERCIAL_MEMBERSHIP_REVIEW_KIND = { unknownHistory: "unknown_history", privileged: "privileged" } as const satisfies Record<string, CommercialMembershipReviewKind>;

/** Roles that can be listed; the canonical leader row is never a case of this review. */
export type CommercialMembershipReviewRole = "tribemate" | "guardian";
export const COMMERCIAL_MEMBERSHIP_REVIEW_ROLES = [TRIBE_MEMBER_ROLE.tribemate, TRIBE_MEMBER_ROLE.guardian] as const satisfies readonly CommercialMembershipReviewRole[];
/** Commercial states and reasons of a listed membership; any status combines with any reason (`isCommercialMembershipState`, `public.is_commercial_membership_state`). */
export type CommercialMembershipReviewStatus = "blocked" | "removed";
export const COMMERCIAL_MEMBERSHIP_REVIEW_STATUSES = [TRIBE_MEMBERSHIP_STATUS.blocked, TRIBE_MEMBERSHIP_STATUS.removed] as const satisfies readonly CommercialMembershipReviewStatus[];
export type CommercialMembershipReviewStatusReason = "payment_blocked" | "subscription_inactive";
export const COMMERCIAL_MEMBERSHIP_REVIEW_STATUS_REASONS = [TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked, TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive] as const satisfies readonly CommercialMembershipReviewStatusReason[];
/** Known recovery snapshot of a membership; `null` means unknown history. */
export type CommercialMembershipRecoveryStatus = "active" | "muted";
export const COMMERCIAL_MEMBERSHIP_RECOVERY_STATUSES = [TRIBE_MEMBERSHIP_STATUS.active, TRIBE_MEMBERSHIP_STATUS.muted] as const satisfies readonly CommercialMembershipRecoveryStatus[];

/** Expected business outcomes recorded as the original result instead of an error. */
export type CommercialMembershipRejection = "membership_unavailable" | "membership_not_commercial" | "membership_changed" | "membership_already_resolved" | "decision_not_allowed" | "canonical_leader";
export const COMMERCIAL_MEMBERSHIP_REJECTION = {
  membershipUnavailable: "membership_unavailable", membershipNotCommercial: "membership_not_commercial", membershipChanged: "membership_changed",
  membershipAlreadyResolved: "membership_already_resolved", decisionNotAllowed: "decision_not_allowed", canonicalLeader: "canonical_leader",
} as const satisfies Record<string, CommercialMembershipRejection>;
/** Outcomes of the owner function: a confirmed decision, an expected rejection or an authority denial. */
export const COMMERCIAL_MEMBERSHIP_REVIEW_STATUS = { resolved: "resolved", rejected: "rejected", denied: "denied" } as const;

/** Ledger namespace and sensitive purpose of the decision; it never authorizes another action. */
export const COMMERCIAL_MEMBERSHIP_REVIEW_OPERATION = REAUTHENTICATION_OPERATION.resolveCommercialMembershipReview;
/** The optional reason shares the bounded internal message limit, also enforced by the owner table. */
export const COMMERCIAL_MEMBERSHIP_REASON_MAX_CHARACTERS = ADMISSION_LIMIT.internalMessageCharacters;
/** Same-origin routes below `/api/tribes/[slug]/admissions`. */
export const COMMERCIAL_MEMBERSHIP_REVIEW_BROWSER_PATH = { list: "commercial-memberships", resolutionSegment: "resolution" } as const;
export const COMMERCIAL_MEMBERSHIP_REVIEW_HTTP_OPERATION = { list: "admission-commercial-membership-list", resolve: "admission-commercial-membership-resolve" } as const;
/** Scopes one pending browser decision by viewer and tribe so an uncertain response is recovered, not repeated. */
export const COMMERCIAL_MEMBERSHIP_REVIEW_STORAGE_PREFIX = "tutribu:commercial-membership-review-intent";

/** Visible copy of the review step and its rows. */
export const COMMERCIAL_MEMBERSHIP_REVIEW_COPY = {
  stepTitle: "Revisá membresías bloqueadas por pago",
  stepDescription: "Estas personas quedaron bloqueadas o dadas de baja por falta de pago y no sabemos cómo deberían volver. Decidí qué pasa con cada una si regulariza el pago.",
  prospective: "Tu decisión vale de acá en adelante: no cambia lo que pasó antes ni reactiva a nadie ahora. Queda registrada con tu cuenta y la fecha.",
  listLabel: "Membresías por revisar",
  loading: "Cargando las membresías por revisar…",
  reload: "Volver a cargar",
  unnamed: "Integrante sin nombre",
  joinedAt: "Alta",
  decisionLabel: "Qué pasa si regulariza el pago",
  reasonLabel: "Motivo (opcional)",
  reasonDescription: `Queda registrado junto con tu decisión. Hasta ${ADMISSION_LIMIT.internalMessageCharacters} caracteres.`,
  confirm: "Confirmo esta decisión. Queda registrada y no se puede deshacer desde acá.",
  submit: "Guardar decisión",
  saving: "Guardando la decisión…",
  pendingBlocked: "Decidí qué pasa con cada membresía antes de continuar.",
  chooseDecision: "Elegí qué pasa con esta membresía.",
  confirmRequired: "Marcá la confirmación para guardar la decisión.",
  uncertain: "Todavía no podemos confirmar si la decisión se guardó. Consultá el resultado antes de volver a decidir.",
  readOriginal: "Consultar resultado",
  recovered: "La decisión anterior quedó confirmada.",
  originalMissing: "La decisión anterior no llegó a guardarse. Podés decidir de nuevo.",
  changedViewer: "La cuenta cambió. Volvé a abrir las reglas con tu cuenta actual.",
} as const;

/** @param name - Visible member name. @returns The confirmed decision message, announced in the page and as a toast. */
export function commercialMembershipResolvedMessage(name: string): string {
  return `Listo: registramos la decisión para ${name}.`;
}
/** @param actionLabel - Final action label of the rules flow. @returns The message shown once no membership is left to review. */
export function commercialMembershipReviewDoneMessage(actionLabel: string): string {
  return `No quedan membresías por revisar; ya podés volver a «${actionLabel}».`;
}

/** Choice copy; guardian choices make clear that the role never comes back with a payment. */
export const COMMERCIAL_MEMBERSHIP_DECISION_COPY = {
  tribemate: {
    recover_active: "Al regularizar el pago vuelve como integrante activa",
    recover_muted: "Al regularizar el pago vuelve como integrante silenciada",
  },
  guardian: {
    recover_active: "Al regularizar el pago vuelve como integrante activa, sin su rol de guardián",
    recover_muted: "Al regularizar el pago vuelve como integrante silenciada, sin su rol de guardián",
    retire: "No vuelve por pago: queda retirada",
  },
} as const satisfies { tribemate: Record<Exclude<CommercialMembershipDecision, "retire">, string>; guardian: Record<CommercialMembershipDecision, string> };

/** Facts shown in each row. */
export const COMMERCIAL_MEMBERSHIP_REVIEW_LABEL = {
  status: { blocked: "Bloqueada", removed: "Dada de baja" },
  statusReason: { payment_blocked: "Pago bloqueado", subscription_inactive: "Suscripción inactiva" },
  kind: { unknown_history: "Estado anterior desconocido", privileged: "Tenía rol de guardián" },
} as const satisfies { status: Record<CommercialMembershipReviewStatus, string>; statusReason: Record<CommercialMembershipReviewStatusReason, string>; kind: Record<CommercialMembershipReviewKind, string> };

/** Safe explanation of each expected rejection. */
export const COMMERCIAL_MEMBERSHIP_REJECTION_COPY = {
  membership_unavailable: "Esta membresía ya no está bloqueada por pago. Actualizamos la lista.",
  membership_not_commercial: "Esta membresía ya no está bloqueada por pago. Actualizamos la lista.",
  membership_changed: "La membresía cambió mientras decidías. Actualizamos la lista: revisala y volvé a decidir.",
  membership_already_resolved: "Esta membresía ya tenía una decisión registrada. Actualizamos la lista.",
  decision_not_allowed: "Esa decisión no está disponible para esta membresía.",
  canonical_leader: "Tu propia membresía no se puede revisar desde acá. Contactá al equipo de TuTribu.",
} as const satisfies Record<CommercialMembershipRejection, string>;
