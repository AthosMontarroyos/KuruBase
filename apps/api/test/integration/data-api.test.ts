import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";
import type { RlsIdentity } from "../../src/types.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const ownerA = `user-a-${randomUUID()}`;
const ownerB = `user-b-${randomUUID()}`;
let pool: Pool;
let app: Awaited<ReturnType<typeof buildApp>>;

const config: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 8080,
  databaseUrl: databaseUrl ?? "postgresql://unused",
  dbPoolMax: 2,
  statementTimeoutMs: 5000,
  exposedSchema: "api",
  identity: {
    mode: "local-jwt",
    issuer: "urn:kurubase:test",
    audience: "kurubase",
    secret: "x".repeat(32)
  },
  rateLimitMax: 1000,
  rateLimitWindow: "1 minute"
};

function claims(sub: string): RlsIdentity {
  return {
    sub,
    org_id: null,
    roles: ["member"],
    scopes: ["kurubase:data:read", "kurubase:data:write"]
  };
}

integration("PostgreSQL Data API and forced RLS", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl ?? "postgresql://unused", max: 2 });
    app = await buildApp({
      config,
      pool,
      logger: false,
      identityProvider: {
        authenticate: async (request) =>
          claims(request.headers.authorization === "Bearer user-b" ? ownerB : ownerA)
      }
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("reports enabled and forced RLS for every exposed table", async () => {
    const result = await pool.query<{
      table_name: string;
      rls_enabled: boolean;
      rls_forced: boolean;
    }>(
      `
        select c.relname as table_name, c.relrowsecurity as rls_enabled,
          c.relforcerowsecurity as rls_forced
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'api' and c.relkind in ('r', 'p')
      `
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.rls_enabled && row.rls_forced)).toBe(true);
  });

  it("isolates rows and blocks owner reassignment", async () => {
    const inserted = await app.inject({
      method: "POST",
      url: "/v1/data/records?select=id,owner_id,data",
      headers: { authorization: "Bearer user-a" },
      payload: { owner_id: ownerA, data: { source: "integration" } }
    });
    expect(inserted.statusCode).toBe(201);
    const recordId = inserted.json().data[0].id as string;

    const crossTenant = await app.inject({
      method: "GET",
      url: `/v1/data/records?select=id&id=eq.${recordId}`,
      headers: { authorization: "Bearer user-b" }
    });
    expect(crossTenant.statusCode).toBe(200);
    expect(crossTenant.json().data).toEqual([]);

    const reassignment = await app.inject({
      method: "PATCH",
      url: `/v1/data/records?select=id,owner_id&id=eq.${recordId}`,
      headers: { authorization: "Bearer user-a" },
      payload: { owner_id: ownerB }
    });
    expect(reassignment.statusCode).toBe(403);

    const cleanup = await app.inject({
      method: "DELETE",
      url: `/v1/data/records?select=id&id=eq.${recordId}`,
      headers: { authorization: "Bearer user-a" }
    });
    expect(cleanup.statusCode).toBe(200);
  });
});
