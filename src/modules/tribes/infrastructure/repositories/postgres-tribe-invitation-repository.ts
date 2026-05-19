import { createHash } from "crypto";

import {
  TRIBE_INVITATION_STATUS,
  TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS,
} from "@/src/modules/tribes/constants/tribe-invitations";
import type {
  AcceptTribeInvitationCommand,
  CreateTribeInvitationCommand,
  ListTribeInvitationsQuery,
  RevokeTribeInvitationCommand,
  TribeInvitationRepository,
} from "@/src/modules/tribes/domain/repositories/tribe-invitation-repository";
import type {
  TribeInvitationAcceptanceResult,
  TribeInvitationCreationResult,
  TribeInvitationListItemResult,
  TribeInvitationRevocationResult,
  TribeInvitationSubscriptionOfferResult,
} from "@/src/modules/tribes/application/results/tribe-invitation-result";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type InvitationRow = {
  created_at: Date | string;
  created_by_name: string | null;
  id: string;
};

type InvitationCreationRow = InvitationRow & {
  status: string | null;
};

type InvitationStatusRow = {
  status: string | null;
};

type InvitationSubscriptionOfferRow = {
  amount_cents: number;
  currency: string;
  frequency: string;
  name: string;
};

type TargetTribeRow = {
  id: string;
};

type ExistingMembershipRow = {
  status: string;
  status_reason: string;
};

const INVITATION_ROUTE = {
  segmentSeparator: "/",
  tribePrefix: "/tribu/",
  inviteSegment: "/invitar/",
} as const;

const INVITATION_DATABASE_CONTEXT_SETTING = {
  currentInvitationHash: "app.current_invitation_hash",
} as const;

const POSTGRES_ERROR_CODE = {
  undefinedFunction: "42883",
  undefinedTable: "42P01",
} as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isValidInvitationId(invitationId: string): boolean {
  return UUID_PATTERN.test(invitationId);
}

function isActiveMembership(status: string | null | undefined): boolean {
  return status === "active" || status === "muted";
}

function createInvitationUrl(baseUrl: string, tribeSlug: string, token: string): string {
  return new URL(
    INVITATION_ROUTE.tribePrefix +
      tribeSlug +
      INVITATION_ROUTE.inviteSegment +
      token,
    baseUrl
  ).toString();
}

function mapInvitation(
  row: InvitationRow,
  invitationUrl: string | null = null
): TribeInvitationListItemResult {
  return {
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    createdByName: row.created_by_name,
    id: row.id,
    invitationUrl,
  };
}

function mapCreationResult(
  row: InvitationCreationRow | null,
  invitationUrl: string
): TribeInvitationCreationResult {
  if (row?.status === TRIBE_INVITATION_STATUS.created) {
    return {
      invitation: mapInvitation(row, invitationUrl),
      invitationUrl,
      status: row.status,
    };
  }

  if (row?.status === TRIBE_INVITATION_STATUS.notFound) {
    return { status: TRIBE_INVITATION_STATUS.notFound };
  }

  return { status: TRIBE_INVITATION_STATUS.forbidden };
}

function mapRevocationResult(row: InvitationStatusRow | null): TribeInvitationRevocationResult {
  if (
    row?.status === TRIBE_INVITATION_STATUS.revoked ||
    row?.status === TRIBE_INVITATION_STATUS.notFound
  ) {
    return { status: row.status };
  }

  return { status: TRIBE_INVITATION_STATUS.forbidden };
}

function mapSubscriptionOfferResult(
  row: InvitationSubscriptionOfferRow | null
): TribeInvitationSubscriptionOfferResult {
  return row
    ? {
        price: {
          amountCents: row.amount_cents,
          currency: row.currency,
          frequency: row.frequency,
          name: row.name,
        },
        status: TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS.available,
      }
    : {
        status: TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS.unavailable,
      };
}

function isMissingInvitationStorageError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as { cause?: unknown; code?: string };
  const directCode = postgresError.code;
  const causeCode =
    postgresError.cause &&
    typeof postgresError.cause === "object" &&
    "code" in postgresError.cause
      ? (postgresError.cause as { code?: string }).code
      : undefined;

  return (
    directCode === POSTGRES_ERROR_CODE.undefinedTable ||
    directCode === POSTGRES_ERROR_CODE.undefinedFunction ||
    causeCode === POSTGRES_ERROR_CODE.undefinedTable ||
    causeCode === POSTGRES_ERROR_CODE.undefinedFunction
  );
}

export class PostgresTribeInvitationRepository implements TribeInvitationRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async listByTribeSlug({
    tribeSlug,
  }: ListTribeInvitationsQuery): Promise<TribeInvitationListItemResult[]> {
    return this.executeWithDatabase(async (database) => {
      const rows = await database.kysely
        .selectFrom("tribes")
        .innerJoin(
          "tribe_invitations",
          "tribe_invitations.tribe_id",
          "tribes.id"
        )
        .leftJoin(
          "user as invitation_creators",
          "invitation_creators.id",
          "tribe_invitations.created_by"
        )
        .select([
          "tribe_invitations.id",
          "tribe_invitations.created_at",
          "invitation_creators.name as created_by_name",
        ])
        .where("tribes.slug", "=", tribeSlug)
        .where("tribe_invitations.status", "=", TRIBE_INVITATION_STATUS.active)
        .where((expressionBuilder) =>
          expressionBuilder.fn<boolean>("public.can_manage_tribe_invitations", [
            "tribes.id",
          ])
        )
        .orderBy("tribe_invitations.created_at", "desc")
        .execute();

      return rows.map((row) => mapInvitation(row));
    }).catch((error: unknown) => {
      if (isMissingInvitationStorageError(error)) {
        return [];
      }

      throw error;
    });
  }

  async create(
    command: CreateTribeInvitationCommand
  ): Promise<TribeInvitationCreationResult> {
    return this.executeWithDatabase(async (database) => {
      const tokenHash = hashInvitationToken(command.token);
      const invitationUrl = createInvitationUrl(
        command.baseUrl,
        command.tribeSlug,
        command.token
      );

      return database.kysely.transaction().execute(async (transaction) => {
        const targetTribe = await transaction
          .selectFrom("tribes")
          .select("id")
          .where("slug", "=", command.tribeSlug)
          .executeTakeFirst();

        if (!targetTribe) {
          return { status: TRIBE_INVITATION_STATUS.notFound };
        }

        const permission = await transaction
          .selectNoFrom((expressionBuilder) => [
            expressionBuilder.fn<boolean>("public.can_manage_tribe_invitations", [
              expressionBuilder.val(targetTribe.id),
            ]).as("can_manage"),
          ])
          .executeTakeFirst();

        if (!permission?.can_manage) {
          return { status: TRIBE_INVITATION_STATUS.forbidden };
        }

        const insertedInvitation = await transaction
          .insertInto("tribe_invitations")
          .columns([
            "created_at",
            "created_by",
            "id",
            "status",
            "token_hash",
            "tribe_id",
          ])
          .expression((expressionBuilder) =>
            expressionBuilder
              .selectFrom("tribes")
              .select([
                expressionBuilder.fn<Date>("timezone", [
                  expressionBuilder.val("utc"),
                  expressionBuilder.fn<Date>("now"),
                ]).as("created_at"),
                expressionBuilder.fn<string>("public.current_app_user_id").as("created_by"),
                expressionBuilder.val(command.invitationId).as("id"),
                expressionBuilder.val(TRIBE_INVITATION_STATUS.active).as("status"),
                expressionBuilder.val(tokenHash).as("token_hash"),
                expressionBuilder.val(targetTribe.id).as("tribe_id"),
              ])
              .where("tribes.id", "=", targetTribe.id)
              .where(
                expressionBuilder.fn<boolean>("public.can_manage_tribe_invitations", [
                  expressionBuilder.val(targetTribe.id),
                ]),
                "=",
                true
              )
          )
          .returning(["id", "created_at", "created_by"])
          .executeTakeFirst();

        const invitationCreator = insertedInvitation
          ? await transaction
              .selectFrom("user")
              .select("name")
              .where("id", "=", insertedInvitation.created_by)
              .executeTakeFirst()
          : null;

        return mapCreationResult(
          insertedInvitation
            ? {
                created_at: insertedInvitation.created_at,
                created_by_name: invitationCreator?.name ?? null,
                id: insertedInvitation.id,
                status: TRIBE_INVITATION_STATUS.created,
              }
            : null,
          invitationUrl
        );
      });
    }).catch((error: unknown) => {
      if (isMissingInvitationStorageError(error)) {
        return { status: TRIBE_INVITATION_STATUS.setupRequired };
      }

      throw error;
    });
  }

  async revoke(
    command: RevokeTribeInvitationCommand
  ): Promise<TribeInvitationRevocationResult> {
    if (!isValidInvitationId(command.invitationId)) {
      return { status: TRIBE_INVITATION_STATUS.notFound };
    }

    return this.executeWithDatabase(async (database) => {
      return database.kysely.transaction().execute(async (transaction) => {
        const targetTribe = await transaction
          .selectFrom("tribes")
          .select("id")
          .where("slug", "=", command.tribeSlug)
          .executeTakeFirst();

        if (!targetTribe) {
          return { status: TRIBE_INVITATION_STATUS.notFound };
        }

        const permission = await transaction
          .selectNoFrom((expressionBuilder) => [
            expressionBuilder.fn<boolean>("public.can_manage_tribe_invitations", [
              expressionBuilder.val(targetTribe.id),
            ]).as("can_manage"),
          ])
          .executeTakeFirst();

        if (!permission?.can_manage) {
          return { status: TRIBE_INVITATION_STATUS.forbidden };
        }

        const targetInvitation = await transaction
          .selectFrom("tribe_invitations")
          .select("id")
          .where("id", "=", command.invitationId)
          .where("tribe_id", "=", targetTribe.id)
          .where("status", "=", TRIBE_INVITATION_STATUS.active)
          .executeTakeFirst();

        if (!targetInvitation) {
          return { status: TRIBE_INVITATION_STATUS.notFound };
        }

        const revokedInvitation = await transaction
          .updateTable("tribe_invitations")
          .set((expressionBuilder) => ({
            revoked_at: expressionBuilder.fn<Date>("timezone", [
              expressionBuilder.val("utc"),
              expressionBuilder.fn<Date>("now"),
            ]),
            status: TRIBE_INVITATION_STATUS.revoked,
          }))
          .where("id", "=", targetInvitation.id)
          .where("status", "=", TRIBE_INVITATION_STATUS.active)
          .where((expressionBuilder) =>
            expressionBuilder.fn<boolean>("public.can_manage_tribe_invitations", [
              "tribe_invitations.tribe_id",
            ])
          )
          .returning("id")
          .executeTakeFirst();

        if (revokedInvitation) {
          return { status: TRIBE_INVITATION_STATUS.revoked };
        }

        const currentPermission = await transaction
          .selectNoFrom((expressionBuilder) => [
            expressionBuilder.fn<boolean>("public.can_manage_tribe_invitations", [
              expressionBuilder.val(targetTribe.id),
            ]).as("can_manage"),
          ])
          .executeTakeFirst();

        return mapRevocationResult({
          status: currentPermission?.can_manage
            ? TRIBE_INVITATION_STATUS.notFound
            : TRIBE_INVITATION_STATUS.forbidden,
        });
      });
    });
  }

  /**
   * Accepts a tribe invitation for the current request user.
   *
   * @param command - Invitation token and tribe slug used to resolve the target invitation.
   * @returns The invitation acceptance status mapped to the application contract.
   */
  async accept(
    command: AcceptTribeInvitationCommand
  ): Promise<TribeInvitationAcceptanceResult> {
    return this.executeWithDatabase(async (database) => {
      const tokenHash = hashInvitationToken(command.token);

      return database.kysely.transaction().execute(async (transaction) => {
        await transaction
          .selectNoFrom((expressionBuilder) => [
            expressionBuilder.fn<string>("set_config", [
              expressionBuilder.val(INVITATION_DATABASE_CONTEXT_SETTING.currentInvitationHash),
              expressionBuilder.val(tokenHash),
              expressionBuilder.val(true),
            ]).as("context"),
          ])
          .executeTakeFirst();

        const targetInvitation = await transaction
          .selectFrom("tribe_invitations")
          .select(["id", "status", "tribe_id"])
          .where("token_hash", "=", tokenHash)
          .executeTakeFirst();

        if (!targetInvitation) {
          return { status: TRIBE_INVITATION_STATUS.invalid };
        }

        const targetTribe = await transaction
          .selectFrom("tribes")
          .select("id")
          .where("id", "=", targetInvitation.tribe_id)
          .where("slug", "=", command.tribeSlug)
          .executeTakeFirst();

        const currentUser = await transaction
          .selectNoFrom((expressionBuilder) => [
            expressionBuilder.fn<string>("public.current_app_user_id").as("id"),
          ])
          .executeTakeFirst();
        const currentUserId = currentUser?.id ?? "";

        const existingMembership = targetTribe
          ? await this.findCurrentMembership(transaction, targetTribe)
          : null;

        if (
          existingMembership?.status === "blocked" &&
          existingMembership.status_reason !== "payment_blocked"
        ) {
          return { status: TRIBE_INVITATION_STATUS.blocked };
        }

        const currentSubscriptionPrice = targetTribe
          ? await transaction
              .selectFrom("tribe_subscription_prices")
              .select("id")
              .where("tribe_id", "=", targetTribe.id)
              .where("is_current", "=", true)
              .where("status", "=", "active")
              .executeTakeFirst()
          : null;

        if (
          currentSubscriptionPrice &&
          targetInvitation.status === TRIBE_INVITATION_STATUS.active &&
          !isActiveMembership(existingMembership?.status)
        ) {
          return { status: TRIBE_INVITATION_STATUS.subscriptionRequired };
        }

        if (isActiveMembership(existingMembership?.status)) {
          return { status: TRIBE_INVITATION_STATUS.accepted };
        }

        if (targetInvitation.status === TRIBE_INVITATION_STATUS.revoked) {
          return { status: TRIBE_INVITATION_STATUS.revoked };
        }

        if (
          !targetTribe ||
          targetInvitation.status !== TRIBE_INVITATION_STATUS.active ||
          currentUserId === "" ||
          existingMembership
        ) {
          return { status: TRIBE_INVITATION_STATUS.invalid };
        }

        await transaction
          .insertInto("tribe_members")
          .columns(["created_at", "role", "status", "tribe_id", "user_id"])
          .expression((expressionBuilder) =>
            expressionBuilder
              .selectFrom("tribe_invitations")
              .innerJoin("tribes", "tribes.id", "tribe_invitations.tribe_id")
              .select([
                expressionBuilder.fn<Date>("timezone", [
                  expressionBuilder.val("utc"),
                  expressionBuilder.fn<Date>("now"),
                ]).as("created_at"),
                expressionBuilder.val("tribemate").as("role"),
                expressionBuilder.val("active").as("status"),
                expressionBuilder.val(targetTribe.id).as("tribe_id"),
                expressionBuilder.val(currentUserId).as("user_id"),
              ])
              .where("tribe_invitations.id", "=", targetInvitation.id)
              .where("tribe_invitations.token_hash", "=", tokenHash)
              .where("tribe_invitations.status", "=", TRIBE_INVITATION_STATUS.active)
              .where("tribes.id", "=", targetTribe.id)
              .where("tribes.slug", "=", command.tribeSlug)
          )
          .onConflict((conflictBuilder) =>
            conflictBuilder.columns(["tribe_id", "user_id"]).doNothing()
          )
          .execute();

        const postInsertMembership = await this.findCurrentMembership(
          transaction,
          targetTribe
        );

        return {
          status: await this.resolvePostAcceptanceStatus(
            transaction,
            tokenHash,
            postInsertMembership
          ),
        };
      });
    });
  }

  async getSubscriptionOffer(command: {
    token: string;
    tribeSlug: string;
  }): Promise<TribeInvitationSubscriptionOfferResult> {
    return this.executeWithDatabase(async (database) => {
      const tokenHash = hashInvitationToken(command.token);
      return database.kysely.transaction().execute(async (transaction) => {
        await transaction
          .selectNoFrom((expressionBuilder) => [
            expressionBuilder.fn<string>("set_config", [
              expressionBuilder.val(INVITATION_DATABASE_CONTEXT_SETTING.currentInvitationHash),
              expressionBuilder.val(tokenHash),
              expressionBuilder.val(true),
            ]).as("context"),
          ])
          .executeTakeFirst();

        const result = await transaction
          .selectFrom("tribe_invitations")
          .innerJoin("tribes", "tribes.id", "tribe_invitations.tribe_id")
          .innerJoin(
            "tribe_subscription_prices",
            "tribe_subscription_prices.tribe_id",
            "tribes.id"
          )
          .select([
            "tribe_subscription_prices.amount_cents",
            "tribe_subscription_prices.currency",
            "tribe_subscription_prices.frequency",
            "tribe_subscription_prices.name",
          ])
          .where("tribe_invitations.token_hash", "=", tokenHash)
          .where("tribe_invitations.status", "=", TRIBE_INVITATION_STATUS.active)
          .where("tribes.slug", "=", command.tribeSlug)
          .where("tribe_subscription_prices.is_current", "=", true)
          .where("tribe_subscription_prices.status", "=", "active")
          .where(
            "tribe_subscription_prices.mercado_pago_preapproval_plan_id",
            "is not",
            null
          )
          .limit(1)
          .executeTakeFirst();

        return mapSubscriptionOfferResult(result ?? null);
      });
    });
  }

  private async findCurrentMembership(
    database: RequestDatabase["kysely"],
    targetTribe: TargetTribeRow
  ): Promise<ExistingMembershipRow | null> {
    return (
      (await database
        .selectFrom("tribe_members")
        .select(["status", "status_reason"])
        .where("tribe_id", "=", targetTribe.id)
        .where((expressionBuilder) =>
          expressionBuilder(
            "user_id",
            "=",
            expressionBuilder.fn<string>("public.current_app_user_id")
          )
        )
        .executeTakeFirst()) ?? null
    );
  }

  private async resolvePostAcceptanceStatus(
    database: RequestDatabase["kysely"],
    tokenHash: string,
    postInsertMembership: ExistingMembershipRow | null
  ): Promise<TribeInvitationAcceptanceResult["status"]> {
    if (isActiveMembership(postInsertMembership?.status)) {
      return TRIBE_INVITATION_STATUS.accepted;
    }

    const latestInvitation = await database
      .selectFrom("tribe_invitations")
      .select("status")
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();

    return latestInvitation?.status === TRIBE_INVITATION_STATUS.revoked
      ? TRIBE_INVITATION_STATUS.revoked
      : TRIBE_INVITATION_STATUS.invalid;
  }
}
