import { createHash } from "crypto";
import { sql } from "drizzle-orm";

import {
  DEFAULT_TRIBE_WELCOME_MESSAGE,
  TRIBE_WELCOME_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-welcome";
import type {
  GetTribeWelcomeByInvitationQuery,
  GetTribeWelcomeQuery,
  SaveTribeWelcomeCommand,
  TribeWelcome,
  TribeWelcomeLink,
  TribeWelcomeRepository,
  TribeWelcomeRule,
} from "@/src/modules/tribes/domain/repositories/tribe-welcome-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type WelcomeSettingsRow = {
  welcome_message: string | null;
};

type WelcomeRuleRow = {
  id: string;
  is_active: boolean;
  label: string;
  sort_order: number;
};

type WelcomeLinkRow = {
  id: string;
  is_active: boolean;
  label: string;
  message: string | null;
  phone_number: string | null;
  sort_order: number;
  type: string;
  url: string | null;
};

type WelcomeSaveRow = {
  status: string | null;
};

type SerializedWelcomeRule = {
  id: string;
  is_active: boolean;
  label: string;
  sort_order: number;
};

type SerializedWelcomeLink = {
  id: string;
  is_active: boolean;
  label: string;
  message: string | null;
  phone_number: string | null;
  sort_order: number;
  type: string;
  url: string | null;
};

const WELCOME_DATABASE_CONTEXT_SETTING = {
  currentInvitationHash: "app.current_invitation_hash",
} as const;

const POSTGRES_ERROR_CODE = {
  undefinedFunction: "42883",
  undefinedTable: "42P01",
} as const;

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function mapSettings(row: WelcomeSettingsRow | null): {
  welcomeMessage: string;
} {
  return {
    welcomeMessage:
      row?.welcome_message?.trim() || DEFAULT_TRIBE_WELCOME_MESSAGE,
  };
}

function mapRule(row: WelcomeRuleRow): TribeWelcomeRule {
  return {
    id: row.id,
    isActive: row.is_active,
    label: row.label,
    sortOrder: row.sort_order,
  };
}

function mapLink(row: WelcomeLinkRow): TribeWelcomeLink {
  return {
    id: row.id,
    isActive: row.is_active,
    label: row.label,
    message: row.message,
    phoneNumber: row.phone_number,
    sortOrder: row.sort_order,
    type: row.type as TribeWelcomeLink["type"],
    url: row.url,
  };
}

function serializeWelcomeRules(
  rules: TribeWelcomeRule[]
): string {
  return JSON.stringify(
    rules.map(
      (rule): SerializedWelcomeRule => ({
        id: rule.id,
        is_active: rule.isActive,
        label: rule.label,
        sort_order: rule.sortOrder,
      })
    )
  );
}

function serializeWelcomeLinks(
  links: TribeWelcomeLink[]
): string {
  return JSON.stringify(
    links.map(
      (link): SerializedWelcomeLink => ({
        id: link.id,
        is_active: link.isActive,
        label: link.label,
        message: link.message,
        phone_number: link.phoneNumber,
        sort_order: link.sortOrder,
        type: link.type,
        url: link.url,
      })
    )
  );
}

function isMissingWelcomeStorageError(error: unknown): boolean {
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

function createDefaultWelcome(): TribeWelcome {
  return {
    links: [],
    rules: [],
    welcomeMessage: DEFAULT_TRIBE_WELCOME_MESSAGE,
  };
}

export class PostgresTribeWelcomeRepository implements TribeWelcomeRepository {
  constructor(private readonly executeWithDatabase: DatabaseExecutor) {}

  async getByTribeSlug({
    tribeSlug,
  }: GetTribeWelcomeQuery): Promise<TribeWelcome> {
    return this.readWelcome({
      includeInactiveItems: false,
      tribeSlug,
    });
  }

  async getEditableByTribeSlug({
    tribeSlug,
  }: GetTribeWelcomeQuery): Promise<TribeWelcome> {
    return this.readWelcome({
      includeInactiveItems: true,
      tribeSlug,
    });
  }

  async getByInvitation({
    token,
    tribeSlug,
  }: GetTribeWelcomeByInvitationQuery): Promise<TribeWelcome> {
    return this.readWelcome({
      includeInactiveItems: false,
      invitationTokenHash: hashInvitationToken(token),
      tribeSlug,
    });
  }

  async save(command: SaveTribeWelcomeCommand) {
    return this.executeWithDatabase(async (database) => {
      const rulesJson = serializeWelcomeRules(command.rules);
      const linksJson = serializeWelcomeLinks(command.links);
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
          where public.can_manage_tribe_welcome(target_tribe.id)
        ),
        upserted_settings as (
          insert into public.tribe_welcome_settings (
            tribe_id,
            welcome_message,
            updated_by,
            created_at,
            updated_at
          )
          select
            editable_tribe.id,
            ${command.welcomeMessage},
            public.current_app_user_id(),
            timezone('utc', now()),
            timezone('utc', now())
          from editable_tribe
          on conflict (tribe_id) do update
          set
            welcome_message = excluded.welcome_message,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
          returning tribe_id
        )
        select
          case
            when exists (select 1 from upserted_settings) then ${TRIBE_WELCOME_SAVE_STATUS.updated}
            when not exists (select 1 from target_tribe) then ${TRIBE_WELCOME_SAVE_STATUS.notFound}
            else ${TRIBE_WELCOME_SAVE_STATUS.forbidden}
          end as status
      `);

      const row = (result.rows?.[0] ?? null) as WelcomeSaveRow | null;

      if (
        row?.status === TRIBE_WELCOME_SAVE_STATUS.notFound
      ) {
        return { status: row.status };
      }

      if (row?.status !== TRIBE_WELCOME_SAVE_STATUS.updated) {
        return { status: TRIBE_WELCOME_SAVE_STATUS.forbidden };
      }

      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        editable_tribe as (
          select target_tribe.id
          from target_tribe
          where public.can_manage_tribe_welcome(target_tribe.id)
        )
        delete from public.tribe_welcome_rules
        using editable_tribe
        where tribe_welcome_rules.tribe_id = editable_tribe.id
      `);
      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        editable_tribe as (
          select target_tribe.id
          from target_tribe
          where public.can_manage_tribe_welcome(target_tribe.id)
        )
        insert into public.tribe_welcome_rules (
          id,
          tribe_id,
          label,
          sort_order,
          is_active,
          created_at,
          updated_at
        )
        select
          rules.id::uuid,
          editable_tribe.id,
          rules.label,
          rules.sort_order,
          rules.is_active,
          timezone('utc', now()),
          timezone('utc', now())
        from editable_tribe,
          jsonb_to_recordset(${rulesJson}::jsonb) as rules(
            id text,
            label text,
            sort_order integer,
            is_active boolean
          )
      `);
      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        editable_tribe as (
          select target_tribe.id
          from target_tribe
          where public.can_manage_tribe_welcome(target_tribe.id)
        )
        delete from public.tribe_welcome_links
        using editable_tribe
        where tribe_welcome_links.tribe_id = editable_tribe.id
      `);
      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        editable_tribe as (
          select target_tribe.id
          from target_tribe
          where public.can_manage_tribe_welcome(target_tribe.id)
        )
        insert into public.tribe_welcome_links (
          id,
          tribe_id,
          type,
          label,
          url,
          phone_number,
          message,
          sort_order,
          is_active,
          created_at,
          updated_at
        )
        select
          links.id::uuid,
          editable_tribe.id,
          links.type,
          links.label,
          links.url,
          links.phone_number,
          links.message,
          links.sort_order,
          links.is_active,
          timezone('utc', now()),
          timezone('utc', now())
        from editable_tribe,
          jsonb_to_recordset(${linksJson}::jsonb) as links(
            id text,
            type text,
            label text,
            url text,
            phone_number text,
            message text,
            sort_order integer,
            is_active boolean
          )
      `);

      return { status: row.status };
    });
  }

  private async readWelcome(input: {
    includeInactiveItems: boolean;
    invitationTokenHash?: string;
    tribeSlug: string;
  }): Promise<TribeWelcome> {
    return this.executeWithDatabase(async (database) => {
      if (input.invitationTokenHash) {
        await database.execute(sql`
          select set_config(
            ${WELCOME_DATABASE_CONTEXT_SETTING.currentInvitationHash},
            ${input.invitationTokenHash},
            true
          )
        `);
      }

      const settingsResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select
          tribe_welcome_settings.welcome_message
        from target_tribe
        left join public.tribe_welcome_settings
          on tribe_welcome_settings.tribe_id = target_tribe.id
        limit 1
      `);
      const rulesResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select
          tribe_welcome_rules.id,
          tribe_welcome_rules.label,
          tribe_welcome_rules.sort_order,
          tribe_welcome_rules.is_active
        from public.tribe_welcome_rules
        inner join target_tribe
          on target_tribe.id = tribe_welcome_rules.tribe_id
        where ${input.includeInactiveItems} or tribe_welcome_rules.is_active = true
        order by tribe_welcome_rules.sort_order asc, tribe_welcome_rules.created_at asc
      `);
      const linksResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select
          tribe_welcome_links.id,
          tribe_welcome_links.type,
          tribe_welcome_links.label,
          tribe_welcome_links.url,
          tribe_welcome_links.phone_number,
          tribe_welcome_links.message,
          tribe_welcome_links.sort_order,
          tribe_welcome_links.is_active
        from public.tribe_welcome_links
        inner join target_tribe
          on target_tribe.id = tribe_welcome_links.tribe_id
        where ${input.includeInactiveItems} or tribe_welcome_links.is_active = true
        order by tribe_welcome_links.sort_order asc, tribe_welcome_links.created_at asc
      `);
      const settings = mapSettings(
        (settingsResult.rows?.[0] ?? null) as WelcomeSettingsRow | null
      );

      return {
        links: ((linksResult.rows ?? []) as WelcomeLinkRow[]).map(mapLink),
        rules: ((rulesResult.rows ?? []) as WelcomeRuleRow[]).map(mapRule),
        welcomeMessage: settings.welcomeMessage,
      };
    }).catch((error: unknown) => {
      if (isMissingWelcomeStorageError(error)) {
        return createDefaultWelcome();
      }

      throw error;
    });
  }
}
