import type { ColumnType, Generated } from "kysely";

type TimestampColumn = ColumnType<Date, Date | string | undefined, Date | string>;

type TribeCreatorWhitelistTable = {
  created_at: TimestampColumn;
  created_by: string | null;
  email: string;
  id: Generated<string>;
  notes: string | null;
};

export type KyselyRequestDatabaseSchema = {
  tribe_creator_whitelist: TribeCreatorWhitelistTable;
};
