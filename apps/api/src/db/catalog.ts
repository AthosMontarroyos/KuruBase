import type { PoolClient } from "pg";
import { AppError } from "../errors.js";

export interface ColumnDefinition {
  name: string;
  dataType: string;
  nullable: boolean;
}

export interface TableDefinition {
  schema: string;
  name: string;
  columns: Map<string, ColumnDefinition>;
}

interface CatalogRow {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  column_name: string;
  data_type: string;
  nullable: boolean;
}

export async function loadExposedTable(
  client: PoolClient,
  schema: string,
  table: string
): Promise<TableDefinition> {
  const result = await client.query<CatalogRow>(
    `
      select
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced,
        a.attname as column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
        not a.attnotnull as nullable
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = $1
        and c.relname = $2
        and c.relkind in ('r', 'p')
        and a.attnum > 0
        and not a.attisdropped
      order by a.attnum
    `,
    [schema, table]
  );

  const first = result.rows[0];
  if (!first) {
    throw new AppError(404, "TABLE_NOT_FOUND", "The requested table is not exposed");
  }
  if (!first.rls_enabled || !first.rls_forced) {
    throw new AppError(503, "TABLE_NOT_SECURE", "The requested table does not meet the RLS requirements");
  }

  return {
    schema,
    name: first.table_name,
    columns: new Map(
      result.rows.map((row) => [
        row.column_name,
        {
          name: row.column_name,
          dataType: row.data_type,
          nullable: row.nullable
        }
      ])
    )
  };
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
