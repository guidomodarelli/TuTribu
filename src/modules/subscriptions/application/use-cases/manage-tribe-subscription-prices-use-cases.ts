/**
 * Provides application use cases for tribe subscription prices.
 *
 * @module manage-tribe-subscription-prices-use-cases
 */

import {
  TRIBE_SUBSCRIPTION_CURRENCY,
  TRIBE_SUBSCRIPTION_FREQUENCY,
  TRIBE_SUBSCRIPTION_PRICE_MINIMUM_AMOUNT_CENTS,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
  TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS,
  TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE,
  TRIBE_SUBSCRIPTION_TRIAL_MINIMUM_DAYS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  CreateTribeSubscriptionPriceCommand,
  DeleteTribeSubscriptionPriceInvitationAction,
  DeleteTribeSubscriptionPriceWithInvitationActionsCommand,
  SyncTribeSubscriptionProviderPlanCommand,
  TribeSubscriptionPriceIdentity,
  TribeSubscriptionPriceListQuery,
  TribeSubscriptionPriceRepository,
  TribeSubscriptionPriceUpdateTrialPolicy,
  UpdateTribeSubscriptionPriceCommand,
} from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";
import { normalizeUuid } from "@/src/modules/shared/application/validation/uuid";

type TribeSubscriptionPriceDependencies = {
  tribeSubscriptionPriceRepository: TribeSubscriptionPriceRepository;
};

type CreateTribeSubscriptionPriceInput = {
  amount: string;
  name: string;
  paymentIntegrationId?: string;
  trialFrequency?: string;
  trialFrequencyType?: string;
  tribeSlug: string;
};

type UpdateTribeSubscriptionPriceInput = CreateTribeSubscriptionPriceInput & {
  priceId: string;
};

const AMOUNT_DECIMAL_SEPARATOR = {
  comma: ",",
  dot: ".",
} as const;
const AMOUNT_CENTS_MULTIPLIER = 100;
const POSTGRES_INTEGER_MAX_VALUE = 2147483647;
const VALID_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const VALID_TRIAL_FREQUENCY_PATTERN = /^\d+$/;
const SUPPORTED_TRIAL_FREQUENCY_TYPES = new Set<string>([
  TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days,
  TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.months,
]);

type NormalizedTrialPeriod = {
  trialFrequency: number | null;
  trialFrequencyType:
    | typeof TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days
    | typeof TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.months
    | null;
};

type NormalizedUpdateTrialPeriod = {
  trialFrequency?: NormalizedTrialPeriod["trialFrequency"];
  trialFrequencyType?: NormalizedTrialPeriod["trialFrequencyType"];
};

type ValidUpdateCommand = UpdateTribeSubscriptionPriceCommand & {
  requiresExistingTrialPolicy: boolean;
};

/**
 * Determines whether a parsed day-based trial length is inside the supported product range.
 *
 * @param parsedTrialFrequency - Trial length parsed from user input.
 * @param trialFrequencyType - Trial period unit parsed from user input.
 * @returns Whether the day-based trial period is valid.
 */
function isSupportedDayTrialFrequency(
  parsedTrialFrequency: number,
  trialFrequencyType: string
): boolean {
  return (
    trialFrequencyType !== TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days ||
    (parsedTrialFrequency >= TRIBE_SUBSCRIPTION_TRIAL_MINIMUM_DAYS &&
      parsedTrialFrequency <= TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS)
  );
}

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
 * Converts optional trial period fields into the canonical application command shape.
 *
 * @param input - Raw trial period values.
 * @returns Normalized trial period, or null when the submitted value is invalid.
 */
function parseTrialPeriod(input: {
  allowExtendedDayTrial?: boolean;
  trialFrequency?: string;
  trialFrequencyType?: string;
}): NormalizedTrialPeriod | null {
  const trialFrequency = normalizeText(input.trialFrequency ?? "");
  const trialFrequencyType = normalizeText(
    input.trialFrequencyType ?? TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days
  );

  if (!trialFrequency) {
    return {
      trialFrequency: null,
      trialFrequencyType: null,
    };
  }

  if (
    !VALID_TRIAL_FREQUENCY_PATTERN.test(trialFrequency) ||
    !SUPPORTED_TRIAL_FREQUENCY_TYPES.has(trialFrequencyType)
  ) {
    return null;
  }

  const parsedTrialFrequency = Number(trialFrequency);

  if (
    !Number.isSafeInteger(parsedTrialFrequency) ||
    parsedTrialFrequency <= 0 ||
    parsedTrialFrequency > POSTGRES_INTEGER_MAX_VALUE ||
    (!input.allowExtendedDayTrial &&
      !isSupportedDayTrialFrequency(parsedTrialFrequency, trialFrequencyType))
  ) {
    return null;
  }

  return {
    trialFrequency: parsedTrialFrequency,
    trialFrequencyType: trialFrequencyType as NormalizedTrialPeriod["trialFrequencyType"],
  };
}

/**
 * Converts optional update trial fields while preserving omitted values.
 *
 * @param input - Raw trial period values from a partial update.
 * @returns Normalized trial period, undefined fields when omitted, or null when invalid.
 */
function parseUpdateTrialPeriod(input: {
  trialFrequency?: string;
  trialFrequencyType?: string;
}): NormalizedUpdateTrialPeriod | null {
  if (
    input.trialFrequency === undefined &&
    input.trialFrequencyType === undefined
  ) {
    return {};
  }

  return parseTrialPeriod({
    ...input,
    allowExtendedDayTrial: true,
  });
}

/**
 * Determines whether the update carries a day-based trial beyond the current creation limit.
 *
 * @param command - Normalized update command.
 * @returns Whether the command needs existing price policy validation.
 */
function requiresExistingTrialPolicy(
  command: NormalizedUpdateTrialPeriod
): boolean {
  return (
    command.trialFrequencyType === TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days &&
    typeof command.trialFrequency === "number" &&
    command.trialFrequency > TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS
  );
}

/**
 * Determines whether an extended day trial matches an existing synchronized provider plan.
 *
 * @param command - Normalized update command.
 * @param trialPolicy - Stored trial policy for the target price.
 * @returns Whether the submitted trial can be preserved.
 */
function isPreservedSynchronizedTrial(
  command: UpdateTribeSubscriptionPriceCommand,
  trialPolicy: TribeSubscriptionPriceUpdateTrialPolicy | null
): boolean {
  return Boolean(
    trialPolicy &&
      trialPolicy.hasMercadoPagoPreapprovalPlan &&
      trialPolicy.trialFrequency === command.trialFrequency &&
      trialPolicy.trialFrequencyType === command.trialFrequencyType
  );
}

/**
 * Removes application-only validation metadata before sending an update to the repository.
 *
 * @param command - Validated update command with application metadata.
 * @returns Repository update command.
 */
function toRepositoryUpdateCommand(
  command: ValidUpdateCommand
): UpdateTribeSubscriptionPriceCommand {
  return {
    amountCents: command.amountCents,
    currency: command.currency,
    frequency: command.frequency,
    name: command.name,
    priceId: command.priceId,
    ...(command.trialFrequency !== undefined
      ? { trialFrequency: command.trialFrequency }
      : {}),
    ...(command.trialFrequencyType !== undefined
      ? { trialFrequencyType: command.trialFrequencyType }
      : {}),
    tribeSlug: command.tribeSlug,
  };
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
  const paymentIntegrationId = normalizeUuid(input.paymentIntegrationId);
  const trialPeriod = parseTrialPeriod(input);
  const tribeSlug = normalizeText(input.tribeSlug);

  if (!amountCents || !name || !paymentIntegrationId || !trialPeriod || !tribeSlug) {
    return null;
  }

  return {
    amountCents,
    currency: TRIBE_SUBSCRIPTION_CURRENCY.ars,
    frequency: TRIBE_SUBSCRIPTION_FREQUENCY.monthly,
    name,
    paymentIntegrationId,
    ...trialPeriod,
    tribeSlug,
  };
}

/**
 * Builds the canonical repository command for updating a price.
 *
 * @param input - Raw price update input from the route or UI.
 * @returns Normalized update command, or null when user input is invalid.
 */
function buildUpdateCommand(
  input: UpdateTribeSubscriptionPriceInput
): ValidUpdateCommand | null {
  const amountCents = parseAmountCents(input.amount);
  const name = normalizeText(input.name);
  const priceId = normalizeText(input.priceId);
  const trialPeriod = parseUpdateTrialPeriod(input);
  const tribeSlug = normalizeText(input.tribeSlug);

  if (!amountCents || !name || !priceId || !trialPeriod || !tribeSlug) {
    return null;
  }

  return {
    amountCents,
    currency: TRIBE_SUBSCRIPTION_CURRENCY.ars,
    frequency: TRIBE_SUBSCRIPTION_FREQUENCY.monthly,
    name,
    priceId,
    requiresExistingTrialPolicy: requiresExistingTrialPolicy(trialPeriod),
    ...trialPeriod,
    tribeSlug,
  };
}

/**
 * Lists subscription prices for a tribe.
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
 * Creates a new subscription price.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that creates a new price.
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
 * Updates mutable price data on the linked provider plan.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that updates one price.
 */
export function updateTribeSubscriptionPrice({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (input: UpdateTribeSubscriptionPriceInput) => {
    const command = buildUpdateCommand(input);

    if (!command) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput };
    }

    if (command.requiresExistingTrialPolicy) {
      const trialPolicy =
        await tribeSubscriptionPriceRepository.getUpdateTrialPolicy({
          priceId: command.priceId,
          tribeSlug: command.tribeSlug,
        });

      if (
        trialPolicy &&
        !isPreservedSynchronizedTrial(command, trialPolicy)
      ) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput };
      }
    }

    return tribeSubscriptionPriceRepository.update(
      toRepositoryUpdateCommand(command)
    );
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
 * Marks the synthetic free-join option as the current offering for the tribe,
 * clearing any active paid price flagged as current.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that toggles the tribe to free-join mode.
 */
export function setTribeFreeJoinAsCurrent({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (command: { tribeSlug: string }) =>
    tribeSubscriptionPriceRepository.setFreeJoinAsCurrent({
      tribeSlug: normalizeText(command.tribeSlug),
    });
}

/**
 * Deletes an unused subscription price.
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUBSCRIPTION_PRICE_INVITATION_ACTION = {
  revoke: "revoke",
  switchToCurrent: "switch_to_current",
  switchToSpecific: "switch_to_specific",
} as const;

function parseInvitationActions(
  input: unknown
): DeleteTribeSubscriptionPriceInvitationAction[] | null {
  if (!Array.isArray(input)) {
    return null;
  }

  const parsed: DeleteTribeSubscriptionPriceInvitationAction[] = [];

  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object") {
      return null;
    }

    const entry = candidate as {
      action?: unknown;
      invitationId?: unknown;
      targetPriceId?: unknown;
    };

    if (
      typeof entry.invitationId !== "string" ||
      !UUID_PATTERN.test(entry.invitationId)
    ) {
      return null;
    }

    if (entry.action === SUBSCRIPTION_PRICE_INVITATION_ACTION.switchToCurrent) {
      parsed.push({
        action: SUBSCRIPTION_PRICE_INVITATION_ACTION.switchToCurrent,
        invitationId: entry.invitationId,
      });
      continue;
    }

    if (entry.action === SUBSCRIPTION_PRICE_INVITATION_ACTION.revoke) {
      parsed.push({
        action: SUBSCRIPTION_PRICE_INVITATION_ACTION.revoke,
        invitationId: entry.invitationId,
      });
      continue;
    }

    if (
      entry.action === SUBSCRIPTION_PRICE_INVITATION_ACTION.switchToSpecific &&
      typeof entry.targetPriceId === "string" &&
      UUID_PATTERN.test(entry.targetPriceId)
    ) {
      parsed.push({
        action: SUBSCRIPTION_PRICE_INVITATION_ACTION.switchToSpecific,
        invitationId: entry.invitationId,
        targetPriceId: entry.targetPriceId,
      });
      continue;
    }

    return null;
  }

  return parsed;
}

export function deleteTribeSubscriptionPriceWithInvitationActions({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (
    input: Omit<
      DeleteTribeSubscriptionPriceWithInvitationActionsCommand,
      "invitationActions"
    > & {
      invitationActions: unknown;
    }
  ) => {
    const invitationActions = parseInvitationActions(input.invitationActions);

    if (!invitationActions) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput };
    }

    return tribeSubscriptionPriceRepository.deleteWithInvitationActions({
      invitationActions,
      priceId: normalizeText(input.priceId),
      tribeSlug: normalizeText(input.tribeSlug),
    });
  };
}

/**
 * Synchronizes a Mercado Pago preapproval plan webhook into the local price.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that reconciles one provider plan webhook.
 */
export function syncMercadoPagoSubscriptionProviderPlanWebhook({
  tribeSubscriptionPriceRepository,
}: TribeSubscriptionPriceDependencies) {
  return async (command: SyncTribeSubscriptionProviderPlanCommand) =>
    tribeSubscriptionPriceRepository.syncProviderPlan({
      eventId: normalizeText(command.eventId),
      resourceId: normalizeText(command.resourceId),
      topic: normalizeText(command.topic),
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
