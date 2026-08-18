import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { AuthClaims, DataEnvelope } from "../types.js";
import { loadExposedTable } from "./catalog.js";
import {
  buildDelete,
  buildInsert,
  buildSelect,
  buildUpdate,
  parseDataQuery,
  type BuiltQuery,
  type ParsedDataQuery
} from "./query-builder.js";
import type { TableDefinition } from "./catalog.js";

export interface DataRequest {
  table: string;
  rawUrl: string;
  claims: AuthClaims;
}

export interface DataService {
  select(request: DataRequest): Promise<DataEnvelope<Record<string, unknown>[]>>;
  insert(
    request: DataRequest,
    rows: Record<string, unknown>[]
  ): Promise<DataEnvelope<Record<string, unknown>[]>>;
  update(
    request: DataRequest,
    changes: Record<string, unknown>
  ): Promise<DataEnvelope<Record<string, unknown>[]>>;
  delete(request: DataRequest): Promise<DataEnvelope<Record<string, unknown>[]>>;
}

export class PostgresDataService implements DataService {
  constructor(
    private readonly pool: Pool,
    private readonly schema: string,
    private readonly statementTimeoutMs: number
  ) {}

  private async transaction<T>(
    claims: AuthClaims,
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    let transactionStarted = false;
    try {
      await client.query("begin");
      transactionStarted = true;
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claims)
      ]);
      await client.query("select set_config('statement_timeout', $1, true)", [
        String(this.statementTimeoutMs)
      ]);
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      if (transactionStarted) await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private envelope(
    rows: QueryResultRow[],
    status: number,
    exactCount: boolean
  ): DataEnvelope<Record<string, unknown>[]> {
    const count = exactCount ? Number(rows[0]?.__kurubase_count ?? 0) : null;
    const data = rows.map((row) => {
      const copy = { ...row };
      delete copy.__kurubase_count;
      return copy;
    });
    return { data, error: null, count, status };
  }

  private async execute(
    request: DataRequest,
    status: number,
    useParsedCount: boolean,
    buildQuery: (table: TableDefinition, query: ParsedDataQuery) => BuiltQuery
  ): Promise<DataEnvelope<Record<string, unknown>[]>> {
    return this.transaction(request.claims, async (client) => {
      const table = await loadExposedTable(client, this.schema, request.table);
      const parsed = parseDataQuery(request.rawUrl, table);
      const query = buildQuery(table, parsed);
      const result = await client.query(query.text, query.values);
      return this.envelope(result.rows, status, useParsedCount && parsed.count);
    });
  }

  async select(request: DataRequest): Promise<DataEnvelope<Record<string, unknown>[]>> {
    return this.execute(request, 200, true, buildSelect);
  }

  async insert(
    request: DataRequest,
    rows: Record<string, unknown>[]
  ): Promise<DataEnvelope<Record<string, unknown>[]>> {
    return this.execute(request, 201, false, (table, query) => buildInsert(table, query, rows));
  }

  async update(
    request: DataRequest,
    changes: Record<string, unknown>
  ): Promise<DataEnvelope<Record<string, unknown>[]>> {
    return this.execute(request, 200, false, (table, query) => buildUpdate(table, query, changes));
  }

  async delete(request: DataRequest): Promise<DataEnvelope<Record<string, unknown>[]>> {
    return this.execute(request, 200, false, buildDelete);
  }
}
