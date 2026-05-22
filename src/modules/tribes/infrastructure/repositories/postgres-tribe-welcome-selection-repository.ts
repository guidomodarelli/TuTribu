import { sql } from "drizzle-orm";

import { TRIBE_WELCOME_SELECTION_STATUS } from "@/src/modules/tribes/constants/tribe-welcome";
import type {
  ListTribeWelcomeSelectionsQuery,
  RecordTribeWelcomeSelectionCommand,
  TribeWelcomeSelection,
  TribeWelcomeSelectionRepository,
} from "@/src/modules/tribes/domain/repositories/tribe-welcome-selection-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type RecordSelectionRow = {
  status: string | null;
};

type SelectionRow = {
  selected_at: string | Date;
  user_id: string;
  welcome_link_id: string;
};

const POSTGRES_ERROR_CODE = {
  undefinedFunction: "42883",
  undefinedTable: "42P01",
} as const;

function mapSelection(row: SelectionRow): TribeWelcomeSelection {
  return {
    selectedAt:
      row.selected_at instanceof Date
        ? row.selected_at
        : new Date(row.selected_at),
    userId: row.user_id,
    welcomeLinkId: row.welcome_link_id,
  };
}

function isMissingSelectionStorageError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as { cause?: unknown; code?: string };
  const causeCode =
    postgresError.cause &&
    typeof postgresError.cause === "object" &&
    "code" in postgresError.cause
      ? (postgresError.cause as { code?: string }).code
      : undefined;

  return (
    postgresError.code === POSTGRES_ERROR_CODE.undefinedTable ||
    postgresError.code === POSTGRES_ERROR_CODE.undefinedFunction ||
    causeCode === POSTGRES_ERROR_CODE.undefinedTable ||
    causeCode === POSTGRES_ERROR_CODE.undefinedFunction
  );
}

export class PostgresTribeWelcomeSelectionRepository
  implements TribeWelcomeSelectionRepository
{
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async record(command: RecordTribeWelcomeSelectionCommand) {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        active_membership as (
          select 1
          from public.tribe_members
          inner join target_tribe
            on target_tribe.id = tribe_members.tribe_id
          where tribe_members.user_id = public.current_app_user_id()
            and tribe_members.status = 'active'
          limit 1
        ),
        eligible_link as (
          select tribe_welcome_links.id, tribe_welcome_links.tribe_id
          from public.tribe_welcome_links
          inner join target_tribe
            on target_tribe.id = tribe_welcome_links.tribe_id
          where tribe_welcome_links.id = ${command.welcomeLinkId}::uuid
            and tribe_welcome_links.is_active = true
          limit 1
        ),
        inserted as (
          insert into public.tribe_welcome_selections (
            tribe_id,
            welcome_link_id,
            user_id,
            selected_at
          )
          select
            eligible_link.tribe_id,
            eligible_link.id,
            public.current_app_user_id(),
            timezone('utc', now())
          from eligible_link
          where exists (select 1 from active_membership)
          returning 1
        )
        select
          case
            when exists (select 1 from inserted) then ${TRIBE_WELCOME_SELECTION_STATUS.recorded}
            when not exists (select 1 from active_membership) then ${TRIBE_WELCOME_SELECTION_STATUS.forbidden}
            when not exists (select 1 from eligible_link) then ${TRIBE_WELCOME_SELECTION_STATUS.invalidLink}
            else ${TRIBE_WELCOME_SELECTION_STATUS.forbidden}
          end as status
      `);

      const row = (result.rows?.[0] ?? null) as RecordSelectionRow | null;
      const status = row?.status;

      if (status === TRIBE_WELCOME_SELECTION_STATUS.recorded) {
        return { status: TRIBE_WELCOME_SELECTION_STATUS.recorded };
      }

      if (status === TRIBE_WELCOME_SELECTION_STATUS.invalidLink) {
        return { status: TRIBE_WELCOME_SELECTION_STATUS.invalidLink };
      }

      return { status: TRIBE_WELCOME_SELECTION_STATUS.forbidden };
    });
  }

  async listByTribeSlug({ tribeSlug }: ListTribeWelcomeSelectionsQuery) {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          tribe_welcome_selections.user_id,
          tribe_welcome_selections.welcome_link_id,
          tribe_welcome_selections.selected_at
        from public.tribe_welcome_selections
        inner join target_tribe
          on target_tribe.id = tribe_welcome_selections.tribe_id
        order by tribe_welcome_selections.selected_at desc
      `);

      return ((result.rows ?? []) as SelectionRow[]).map(mapSelection);
    }).catch((error: unknown) => {
      if (isMissingSelectionStorageError(error)) {
        return [];
      }

      throw error;
    });
  }
}
