import { createHash } from "crypto";
import { sql } from "drizzle-orm";

import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
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

function mapAcceptanceResult(row: InvitationStatusRow | null): TribeInvitationAcceptanceResult {
  if (
    row?.status === TRIBE_INVITATION_STATUS.accepted ||
    row?.status === TRIBE_INVITATION_STATUS.blocked ||
    row?.status === TRIBE_INVITATION_STATUS.invalid ||
    row?.status === TRIBE_INVITATION_STATUS.revoked
  ) {
    return { status: row.status };
  }

  return { status: TRIBE_INVITATION_STATUS.invalid };
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
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          tribe_invitations.id,
          tribe_invitations.created_at,
          invitation_creators.name as created_by_name
        from public.tribe_invitations
        inner join target_tribe
          on target_tribe.id = tribe_invitations.tribe_id
        left join public."user" invitation_creators
          on invitation_creators.id = tribe_invitations.created_by
        where tribe_invitations.status = ${TRIBE_INVITATION_STATUS.active}
          and public.can_manage_tribe_invitations(target_tribe.id)
        order by tribe_invitations.created_at desc
      `);

      return ((result.rows ?? []) as InvitationRow[]).map((row) =>
        mapInvitation(row)
      );
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
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        inserted_invitation as (
          insert into public.tribe_invitations (
            id,
            tribe_id,
            token_hash,
            created_by,
            status,
            created_at
          )
          select
            ${command.invitationId},
            target_tribe.id,
            ${tokenHash},
            public.current_app_user_id(),
            ${TRIBE_INVITATION_STATUS.active},
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_invitations(target_tribe.id)
          returning id, created_at, created_by
        )
        select
          case
            when exists (select 1 from inserted_invitation) then ${TRIBE_INVITATION_STATUS.created}
            when not exists (select 1 from target_tribe) then ${TRIBE_INVITATION_STATUS.notFound}
            else ${TRIBE_INVITATION_STATUS.forbidden}
          end as status,
          inserted_invitation.id,
          inserted_invitation.created_at,
          invitation_creators.name as created_by_name
        from (select 1) result
        left join inserted_invitation
          on true
        left join public."user" invitation_creators
          on invitation_creators.id = inserted_invitation.created_by
      `);

      return mapCreationResult(
        (result.rows?.[0] ?? null) as InvitationCreationRow | null,
        invitationUrl
      );
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
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_invitation as (
          select tribe_invitations.id
          from public.tribe_invitations
          inner join target_tribe
            on target_tribe.id = tribe_invitations.tribe_id
          where tribe_invitations.id = ${command.invitationId}
            and tribe_invitations.status = ${TRIBE_INVITATION_STATUS.active}
          limit 1
        ),
        revoked_invitation as (
          update public.tribe_invitations
          set
            status = ${TRIBE_INVITATION_STATUS.revoked},
            revoked_at = timezone('utc', now())
          where tribe_invitations.id = (select id from target_invitation)
            and public.can_manage_tribe_invitations(tribe_invitations.tribe_id)
          returning tribe_invitations.id
        )
        select
          case
            when exists (select 1 from revoked_invitation) then ${TRIBE_INVITATION_STATUS.revoked}
            when not exists (select 1 from target_tribe) then ${TRIBE_INVITATION_STATUS.notFound}
            when not public.can_manage_tribe_invitations((select id from target_tribe)) then ${TRIBE_INVITATION_STATUS.forbidden}
            when not exists (select 1 from target_invitation) then ${TRIBE_INVITATION_STATUS.notFound}
            else ${TRIBE_INVITATION_STATUS.forbidden}
          end as status
      `);

      return mapRevocationResult((result.rows?.[0] ?? null) as InvitationStatusRow | null);
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
      const result = await database.execute(sql`
        with invitation_acceptance_context as (
          select
            set_config(
              ${INVITATION_DATABASE_CONTEXT_SETTING.currentInvitationHash},
              ${tokenHash},
              true
            )
        ),
        target_invitation as (
          select
            tribe_invitations.id,
            tribe_invitations.status,
            tribe_invitations.tribe_id
          from public.tribe_invitations
          cross join invitation_acceptance_context
          where tribe_invitations.token_hash = ${tokenHash}
          limit 1
        ),
        target_tribe as (
          select tribes.id
          from public.tribes
          inner join target_invitation
            on target_invitation.tribe_id = tribes.id
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        existing_membership as (
          select tribe_members.status
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          where tribe_members.user_id = public.current_app_user_id()
          limit 1
        ),
        inserted_membership as (
          insert into public.tribe_members (
            tribe_id,
            user_id,
            role,
            status,
            created_at
          )
          select
            target_tribe.id,
            public.current_app_user_id(),
            'tribemate',
            'active',
            timezone('utc', now())
          from target_tribe
          cross join target_invitation
          cross join invitation_acceptance_context
          where target_invitation.status = ${TRIBE_INVITATION_STATUS.active}
            and public.current_app_user_id() <> ''
            and not exists (select 1 from existing_membership)
          on conflict (tribe_id, user_id) do nothing
          returning id
        ),
        post_insert_membership as (
          select tribe_members.status
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          where tribe_members.user_id = public.current_app_user_id()
          limit 1
        )
        select
          case
            when exists (
              select 1 from existing_membership where status = 'blocked'
            ) then ${TRIBE_INVITATION_STATUS.blocked}
            when exists (
              select 1 from existing_membership where status in ('active', 'muted')
            ) then ${TRIBE_INVITATION_STATUS.accepted}
            when exists (select 1 from inserted_membership) then ${TRIBE_INVITATION_STATUS.accepted}
            when exists (
              select 1 from post_insert_membership where status in ('active', 'muted')
            ) then ${TRIBE_INVITATION_STATUS.accepted}
            when exists (
              select 1 from target_invitation where status = ${TRIBE_INVITATION_STATUS.revoked}
            ) then ${TRIBE_INVITATION_STATUS.revoked}
            when not exists (select 1 from target_invitation) then ${TRIBE_INVITATION_STATUS.invalid}
            else ${TRIBE_INVITATION_STATUS.invalid}
          end as status
      `);

      return mapAcceptanceResult((result.rows?.[0] ?? null) as InvitationStatusRow | null);
    });
  }
}
