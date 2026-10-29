import { sql } from "drizzle-orm";

import { TRIBE_SUPPORT_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-support";
import type {
  GetTribeSupportQuery,
  SaveTribeSupportCommand,
  TribeSupportChannel,
  TribeSupportRepository,
  TribeSupportSaveResult,
  TribeSupportSettings,
} from "@/src/modules/tribes/domain/repositories/tribe-support-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import {
  POSTGRES_ERROR_CODE,
  hasPostgresErrorCode,
} from "@/src/modules/shared/infrastructure/database/postgres-error";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type SupportSettingsRow = {
  channel: string;
  message: string | null;
  phone_number: string;
};

type SupportSaveRow = {
  channel: string | null;
  message: string | null;
  phone_number: string | null;
  status: string | null;
};

function isMissingSupportStorageError(error: unknown): boolean {
  return hasPostgresErrorCode(error, [
    POSTGRES_ERROR_CODE.undefinedTable,
    POSTGRES_ERROR_CODE.undefinedFunction,
  ]);
}

function mapSettings(row: SupportSettingsRow): TribeSupportSettings {
  return {
    channel: row.channel as TribeSupportChannel,
    message: row.message,
    phoneNumber: row.phone_number,
  };
}

export class PostgresTribeSupportRepository implements TribeSupportRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async getByTribeSlug({
    tribeSlug,
  }: GetTribeSupportQuery): Promise<TribeSupportSettings | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          tribe_support_settings.channel,
          tribe_support_settings.phone_number,
          tribe_support_settings.message
        from public.tribe_support_settings
        inner join target_tribe
          on target_tribe.id = tribe_support_settings.tribe_id
        limit 1
      `);

      const row = (result.rows[0] ?? null) as SupportSettingsRow | null;

      return row ? mapSettings(row) : null;
    }).catch((error: unknown) => {
      if (isMissingSupportStorageError(error)) {
        return null;
      }

      throw error;
    });
  }

  async save(command: SaveTribeSupportCommand): Promise<TribeSupportSaveResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        editable_tribe as (
          select target_tribe.id
          from target_tribe
          where public.can_manage_tribe_support(target_tribe.id)
        ),
        upserted_settings as (
          insert into public.tribe_support_settings (
            tribe_id,
            channel,
            phone_number,
            message,
            updated_by,
            created_at,
            updated_at
          )
          select
            editable_tribe.id,
            ${command.channel},
            ${command.phoneNumber},
            ${command.message},
            public.current_app_user_id(),
            timezone('utc', now()),
            timezone('utc', now())
          from editable_tribe
          on conflict (tribe_id) do update
          set
            channel = excluded.channel,
            phone_number = excluded.phone_number,
            message = excluded.message,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
          returning channel, phone_number, message
        )
        select
          case
            when exists (select 1 from upserted_settings) then ${TRIBE_SUPPORT_SAVE_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${TRIBE_SUPPORT_SAVE_STATUS.notFound}
            else ${TRIBE_SUPPORT_SAVE_STATUS.forbidden}
          end as status,
          (select channel from upserted_settings) as channel,
          (select phone_number from upserted_settings) as phone_number,
          (select message from upserted_settings) as message
      `);

      const row = (result.rows[0] ?? null) as SupportSaveRow | null;

      if (row?.status === TRIBE_SUPPORT_SAVE_STATUS.updated) {
        if (!row.channel || !row.phone_number) {
          return { settings: null, status: TRIBE_SUPPORT_SAVE_STATUS.forbidden };
        }

        return {
          settings: {
            channel: row.channel as TribeSupportChannel,
            message: row.message,
            phoneNumber: row.phone_number,
          },
          status: TRIBE_SUPPORT_SAVE_STATUS.updated,
        };
      }

      if (row?.status === TRIBE_SUPPORT_SAVE_STATUS.notFound) {
        return { settings: null, status: TRIBE_SUPPORT_SAVE_STATUS.notFound };
      }

      return { settings: null, status: TRIBE_SUPPORT_SAVE_STATUS.forbidden };
    });
  }
}
