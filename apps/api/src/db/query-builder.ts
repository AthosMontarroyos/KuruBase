import { badRequest } from "../errors.js";
import { quoteIdentifier, type TableDefinition } from "./catalog.js";

export type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in";

export interface QueryFilter {
  column: string;
  operator: FilterOperator;
  value: string | string[];
}

export interface OrderClause {
  column: string;
  ascending: boolean;
}

export interface ParsedDataQuery {
  columns: string[];
  filters: QueryFilter[];
  order: OrderClause[];
  limit: number;
  offset: number;
  count: boolean;
}

export interface BuiltQuery {
  text: string;
  values: unknown[];
}

const reserved = new Set(["select", "order", "limit", "offset", "count"]);
const operators = new Set<FilterOperator>(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in"]);

function requireColumn(table: TableDefinition, column: string): string {
  if (!table.columns.has(column)) {
    throw badRequest(`Unknown column: ${column}`);
  }
  return column;
}

function parseColumns(value: string | null, table: TableDefinition): string[] {
  if (!value || value === "*") {
    return [...table.columns.keys()];
  }
  const columns = value.split(",").map((column) => column.trim()).filter(Boolean);
  if (columns.length === 0) {
    throw badRequest("At least one select column is required");
  }
  return [...new Set(columns.map((column) => requireColumn(table, column)))];
}

function parseInteger(value: string | null, fallback: number, maximum: number, name: string): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) throw badRequest(`${name} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw badRequest(`${name} exceeds the maximum of ${maximum}`);
  }
  return parsed;
}

function parseFilter(column: string, raw: string, table: TableDefinition): QueryFilter {
  requireColumn(table, column);
  const separator = raw.indexOf(".");
  if (separator < 1) throw badRequest(`Filter for ${column} must include an operator`);
  const operator = raw.slice(0, separator) as FilterOperator;
  const encodedValue = raw.slice(separator + 1);
  if (!operators.has(operator)) throw badRequest(`Unsupported filter operator: ${operator}`);
  if (operator === "in") {
    if (!encodedValue.startsWith("(") || !encodedValue.endsWith(")")) {
      throw badRequest("The in filter must use parenthesized comma-separated values");
    }
    const values = encodedValue.slice(1, -1).split(",").map((value) => value.trim());
    if (values.length === 0 || values.length > 100) throw badRequest("The in filter accepts 1 to 100 values");
    return { column, operator, value: values };
  }
  return { column, operator, value: encodedValue };
}

export function parseDataQuery(rawUrl: string, table: TableDefinition): ParsedDataQuery {
  const url = new URL(rawUrl, "http://localhost");
  const filters: QueryFilter[] = [];

  for (const [key, value] of url.searchParams.entries()) {
    if (!reserved.has(key)) filters.push(parseFilter(key, value, table));
  }

  const order = (url.searchParams.get("order") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry): OrderClause => {
      const [column, direction = "asc"] = entry.split(".");
      if (!column) throw badRequest("Order requires a column");
      requireColumn(table, column);
      if (direction !== "asc" && direction !== "desc") throw badRequest("Order direction must be asc or desc");
      return { column, ascending: direction === "asc" };
    });

  return {
    columns: parseColumns(url.searchParams.get("select"), table),
    filters,
    order,
    limit: parseInteger(url.searchParams.get("limit"), 100, 1000, "limit"),
    offset: parseInteger(url.searchParams.get("offset"), 0, 100_000, "offset"),
    count: url.searchParams.get("count") === "exact"
  };
}

function compileFilters(filters: QueryFilter[], values: unknown[]): string {
  if (filters.length === 0) return "";
  const clauses = filters.map((filter) => {
    const column = quoteIdentifier(filter.column);
    if (filter.operator === "in") {
      const list = filter.value as string[];
      const placeholders = list.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `${column} in (${placeholders.join(", ")})`;
    }
    if ((filter.operator === "eq" || filter.operator === "neq") && filter.value === "null") {
      return `${column} is ${filter.operator === "neq" ? "not " : ""}null`;
    }
    const sqlOperator: Record<Exclude<FilterOperator, "in">, string> = {
      eq: "=",
      neq: "<>",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
      like: "like",
      ilike: "ilike"
    };
    values.push(filter.value);
    return `${column} ${sqlOperator[filter.operator]} $${values.length}`;
  });
  return ` where ${clauses.join(" and ")}`;
}

function returningColumns(query: ParsedDataQuery): string {
  return query.columns.map(quoteIdentifier).join(", ");
}

function relation(table: TableDefinition): string {
  return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
}

export function buildSelect(table: TableDefinition, query: ParsedDataQuery): BuiltQuery {
  const values: unknown[] = [];
  const countColumn = query.count ? ", count(*) over()::int as __kurubase_count" : "";
  const where = compileFilters(query.filters, values);
  const order = query.order.length
    ? ` order by ${query.order.map((item) => `${quoteIdentifier(item.column)} ${item.ascending ? "asc" : "desc"}`).join(", ")}`
    : "";
  values.push(query.limit, query.offset);
  return {
    text: `select ${returningColumns(query)}${countColumn} from ${relation(table)}${where}${order} limit $${values.length - 1} offset $${values.length}`,
    values
  };
}

function validateMutationRecord(table: TableDefinition, value: Record<string, unknown>): string[] {
  const columns = Object.keys(value);
  if (columns.length === 0) throw badRequest("Mutation payloads cannot be empty");
  return columns.map((column) => requireColumn(table, column));
}

export function buildInsert(
  table: TableDefinition,
  query: ParsedDataQuery,
  rows: Record<string, unknown>[]
): BuiltQuery {
  if (rows.length === 0 || rows.length > 1000) throw badRequest("Insert accepts 1 to 1000 rows");
  const columns = validateMutationRecord(table, rows[0] ?? {});
  const expected = new Set(columns);
  const values: unknown[] = [];
  const groups = rows.map((row) => {
    const rowColumns = validateMutationRecord(table, row);
    if (rowColumns.length !== expected.size || rowColumns.some((column) => !expected.has(column))) {
      throw badRequest("Bulk insert rows must have identical columns");
    }
    return `(${columns.map((column) => {
      values.push(row[column]);
      return `$${values.length}`;
    }).join(", ")})`;
  });
  return {
    text: `insert into ${relation(table)} (${columns.map(quoteIdentifier).join(", ")}) values ${groups.join(", ")} returning ${returningColumns(query)}`,
    values
  };
}

export function buildUpdate(
  table: TableDefinition,
  query: ParsedDataQuery,
  changes: Record<string, unknown>
): BuiltQuery {
  if (query.filters.length === 0) throw badRequest("Update requires at least one filter");
  const columns = validateMutationRecord(table, changes);
  const values: unknown[] = [];
  const assignments = columns.map((column) => {
    values.push(changes[column]);
    return `${quoteIdentifier(column)} = $${values.length}`;
  });
  const where = compileFilters(query.filters, values);
  return {
    text: `update ${relation(table)} set ${assignments.join(", ")}${where} returning ${returningColumns(query)}`,
    values
  };
}

export function buildDelete(table: TableDefinition, query: ParsedDataQuery): BuiltQuery {
  if (query.filters.length === 0) throw badRequest("Delete requires at least one filter");
  const values: unknown[] = [];
  const where = compileFilters(query.filters, values);
  return {
    text: `delete from ${relation(table)}${where} returning ${returningColumns(query)}`,
    values
  };
}
