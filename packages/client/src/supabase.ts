export interface KuruBaseError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface KuruBaseResponse<T> {
  data: T | null;
  error: KuruBaseError | null;
  count: number | null;
  status: number;
}

export type AccessTokenProvider = string | (() => string | Promise<string>);

export interface KuruBaseClientOptions {
  /**
   * Optional bearer token used by OIDC and local JWT deployments.
   * Browser clients behind Cloudflare Access should omit it and rely on the
   * same-origin Access session instead.
   */
  accessToken?: AccessTokenProvider;
  /**
   * Additional request headers. Cloudflare Access service-token credentials
   * may only be supplied from a trusted server runtime; never include them in
   * browser bundles or other client-side code.
   */
  headers?: HeadersInit;
  fetch?: typeof globalThis.fetch;
}

export interface SelectOptions {
  count?: "exact";
}

export interface OrderOptions {
  ascending?: boolean;
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type FilterValue = string | number | boolean | bigint | null;

interface Filter {
  column: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in";
  value: string;
}

interface QueryState {
  method: HttpMethod;
  columns: string;
  body: unknown;
  filters: Filter[];
  orders: string[];
  limit: number | null;
  offset: number | null;
  count: "exact" | null;
}

function serializeValue(value: FilterValue): string {
  return value === null ? "null" : String(value);
}

class KuruQueryBuilder<Row extends Record<string, unknown>>
  implements PromiseLike<KuruBaseResponse<Row[]>>
{
  private readonly state: QueryState = {
    method: "GET",
    columns: "*",
    body: null,
    filters: [],
    orders: [],
    limit: null,
    offset: null,
    count: null
  };

  constructor(
    private readonly client: KuruBaseClient,
    private readonly table: string
  ) {}

  select(columns = "*", options: SelectOptions = {}): this {
    this.state.columns = columns;
    this.state.count = options.count ?? null;
    return this;
  }

  insert(values: Partial<Row> | Partial<Row>[]): this {
    this.state.method = "POST";
    this.state.body = values;
    return this;
  }

  update(values: Partial<Row>): this {
    this.state.method = "PATCH";
    this.state.body = values;
    return this;
  }

  delete(): this {
    this.state.method = "DELETE";
    this.state.body = null;
    return this;
  }

  private filter(
    operator: Filter["operator"],
    column: keyof Row & string,
    value: FilterValue
  ): this {
    this.state.filters.push({ column, operator, value: serializeValue(value) });
    return this;
  }

  eq(column: keyof Row & string, value: FilterValue): this {
    return this.filter("eq", column, value);
  }

  neq(column: keyof Row & string, value: FilterValue): this {
    return this.filter("neq", column, value);
  }

  gt(column: keyof Row & string, value: FilterValue): this {
    return this.filter("gt", column, value);
  }

  gte(column: keyof Row & string, value: FilterValue): this {
    return this.filter("gte", column, value);
  }

  lt(column: keyof Row & string, value: FilterValue): this {
    return this.filter("lt", column, value);
  }

  lte(column: keyof Row & string, value: FilterValue): this {
    return this.filter("lte", column, value);
  }

  like(column: keyof Row & string, pattern: string): this {
    return this.filter("like", column, pattern);
  }

  ilike(column: keyof Row & string, pattern: string): this {
    return this.filter("ilike", column, pattern);
  }

  in(column: keyof Row & string, values: FilterValue[]): this {
    if (values.length === 0) {
      throw new Error("The in filter requires at least one value");
    }
    this.state.filters.push({
      column,
      operator: "in",
      value: `(${values.map(serializeValue).join(",")})`
    });
    return this;
  }

  order(column: keyof Row & string, options: OrderOptions = {}): this {
    this.state.orders.push(`${column}.${options.ascending === false ? "desc" : "asc"}`);
    return this;
  }

  limit(count: number): this {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Limit must be a non-negative integer");
    }
    this.state.limit = count;
    return this;
  }

  range(from: number, to: number): this {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) {
      throw new Error("Range must contain non-negative inclusive bounds");
    }
    this.state.offset = from;
    this.state.limit = to - from + 1;
    return this;
  }

  then<TResult1 = KuruBaseResponse<Row[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: KuruBaseResponse<Row[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<KuruBaseResponse<Row[]>> {
    const parameters = new URLSearchParams({ select: this.state.columns });
    for (const filter of this.state.filters) {
      parameters.append(filter.column, `${filter.operator}.${filter.value}`);
    }
    if (this.state.orders.length) parameters.set("order", this.state.orders.join(","));
    if (this.state.limit !== null) parameters.set("limit", String(this.state.limit));
    if (this.state.offset !== null) parameters.set("offset", String(this.state.offset));
    if (this.state.count) parameters.set("count", this.state.count);

    return this.client.request<Row[]>(
      this.table,
      this.state.method,
      parameters,
      this.state.body
    );
  }
}

export class KuruBaseClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof globalThis.fetch;

  constructor(
    baseUrl: string,
    private readonly options: KuruBaseClientOptions = {}
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!this.fetchImplementation) {
      throw new Error("A Fetch API implementation is required");
    }
  }

  from<Row extends Record<string, unknown> = Record<string, unknown>>(
    table: string
  ): KuruQueryBuilder<Row> {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) {
      throw new Error("Table names must be lowercase PostgreSQL identifiers");
    }
    return new KuruQueryBuilder<Row>(this, table);
  }

  async request<T>(
    table: string,
    method: HttpMethod,
    parameters: URLSearchParams,
    body: unknown
  ): Promise<KuruBaseResponse<T>> {
    try {
      const token =
        typeof this.options.accessToken === "function"
          ? await this.options.accessToken()
          : this.options.accessToken;
      const headers = new Headers(this.options.headers);
      if (token) {
        headers.set("authorization", `Bearer ${token}`);
      }
      headers.set("accept", "application/json");
      const init: RequestInit = { method, headers };
      if (body !== null && method !== "GET" && method !== "DELETE") {
        headers.set("content-type", "application/json");
        init.body = JSON.stringify(body);
      }
      const response = await this.fetchImplementation(
        `${this.baseUrl}/v1/data/${table}?${parameters.toString()}`,
        init
      );
      const payload = (await response.json()) as KuruBaseResponse<T>;
      return payload;
    } catch {
      return {
        data: null,
        error: {
          code: "NETWORK_ERROR",
          message: "The KuruBase API could not be reached"
        },
        count: null,
        status: 0
      };
    }
  }
}

export function createClient(
  baseUrl: string,
  options: KuruBaseClientOptions = {}
): KuruBaseClient {
  return new KuruBaseClient(baseUrl, options);
}
