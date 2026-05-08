/**
 * Provides application use cases for immutable tribe subscription prices.
 *
 * @module manage-tribe-subscription-prices-use-cases
 */

import {
  TRIBE_SUBSCRIPTION_CURRENCY,
  TRIBE_SUBSCRIPTION_FREQUENCY,
  TRIBE_SUBSCRIPTION_PRICE_MINIMUM_AMOUNT_CENTS,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  CreateTribeSubscriptionPriceCommand,
  TribeSubscriptionPriceIdentity,
  TribeSubscriptionPriceListQuery,
  TribeSubscriptionPriceRepository,
} from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";

type TribeSubscriptionPriceDependencies = {
  tribeSubscriptionPriceRepository: TribeSubscriptionPriceRepository;
};

type CreateTribeSubscriptionPriceInput = {
  amount: string;
  name: string;
  tribeSlug: string;
};

const AMOUNT_DECIMAL_SEPARATOR = {
  comma: ",",
  dot: ".",
} as const;
const AMOUNT_CENTS_MULTIPLIER = 100;
const POSTGRES_INTEGER_MAX_VALUE = 2147483647;
const VALID_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Normalizes text input by trimming surrounding whitespace.
 *
 * @param value - User-provided text value.
 * @returns Trimmed text value.
 */
function normalizeText(value: string): string {
  return value.trim();
}

/**
 * Converts a decimal ARS amount to integer cents.
 *
 * @param amount - Decimal amount typed by an admin.
 * @returns Integer amount in cents, or null when invalid.
 */
function parseAmountCents(amount: string): number | null {
  const normalizedAmount = amount
    .trim()
    .replace(AMOUNT_DECIMAL_SEPARATOR.comma, AMOUNT_DECIMAL_SEPARATOR.dot);

  if (!VALID_AMOUNT_PATTERN.test(normalizedAmount)) {
    return null;
  }

  const amountCents = Math.round(
    Number(normalizedAmount) * AMOUNT_CENTS_MULTIPLIER
  );

  return Number.isSafeInteger(amountCents) &&
    amountCents >= TRIBE_SUBSCRIPTION_PRICE_MINIMUM_AMOUNT_CENTS &&
    amountCents <= POSTGRES_INTEGER_MAX_VALUE
    ? amountCents
    : null;
}

/**
 * Builds the canonical repository command for creating a price.
 *
 * @param input - Raw price creation input from the route or UI.
 * @returns Normalized command, or null when user input is invalid.
 */
function buildCreateCommand(
  input: CreateTribeSubscriptionPriceInput
): CreateTribeSubscriptionPriceCommand | null {
  const amountCents = parseAmountCents(input.amount);
  const name = normalizeText(input.name);
  const tribeSlug = normalizeText(input.tribeSlug);

  if (!amountCents || !name || !tribeSlug) {
    return null;
  }

  return {
    amountCents,
    currency: TRIBE_SUBSCRIPTION_CURRENCY.ars,
    frequency: TRIBE_SUBSCRIPTION_FREQUENCY.monthly,
    name,
    tribeSlug,
  };
}

/**
 * Lists immutable subscription prices for a tribe.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that lists prices by tribe slug.
 */
export function listTribeSubscriptionPrices({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (query: TribeSubscriptionPriceListQuery) =>
    tribeSubscriptionPriceRepository.listByTribeSlug({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

/**
 * Creates a new immutable subscription price version.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that creates a new price version.
 */
export function createTribeSubscriptionPrice({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (input: CreateTribeSubscriptionPriceInput) => {
    const command = buildCreateCommand(input);

    if (!command) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput };
    }

    return tribeSubscriptionPriceRepository.create(command);
  };
}

/**
 * Marks an existing subscription price as the current price for new members.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that marks one price as current.
 */
export function makeTribeSubscriptionPriceCurrent({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (command: TribeSubscriptionPriceIdentity) =>
    tribeSubscriptionPriceRepository.makeCurrent({
      priceId: normalizeText(command.priceId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}

/**
 * Deletes an unused immutable subscription price version.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that deletes a price when it has no subscribers.
 */
export function deleteTribeSubscriptionPrice({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (command: TribeSubscriptionPriceIdentity) =>
    tribeSubscriptionPriceRepository.delete({
      priceId: normalizeText(command.priceId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}

/**
 * Verifies all active provider plans for a tribe.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that verifies provider plans by tribe slug.
 */
export function verifyTribeSubscriptionProviderPlans({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (query: TribeSubscriptionPriceListQuery) =>
    tribeSubscriptionPriceRepository.verifyProviderPlans({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

/**
 * Verifies one active provider plan for a tribe price.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that verifies one provider plan by price id.
 */
export function verifyTribeSubscriptionProviderPlan({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (command: TribeSubscriptionPriceIdentity) =>
    tribeSubscriptionPriceRepository.verifyProviderPlan({
      priceId: normalizeText(command.priceId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}

/**
 * Verifies real Mercado Pago subscribers for one tribe price.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that verifies provider subscribers by price id.
 */
export function verifyTribeSubscriptionProviderSubscribers({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (command: TribeSubscriptionPriceIdentity) =>
    tribeSubscriptionPriceRepository.verifyProviderSubscribers({
      priceId: normalizeText(command.priceId),
      tribeSlug: normalizeText(command.tribeSlug),
    });
}
