import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";
import type { DataService } from "../../src/db/data-service.js";
import type { AuthClaims } from "../../src/types.js";

const config: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 8080,
  databaseUrl: "postgresql://unused",
  dbPoolMax: 2,
  statementTimeoutMs: 5000,
  exposedSchema: "api",
  kuruAuthIssuer: "https://auth.test",
  kuruAuthAudience: "kurubase",
  kuruAuthJwksUrl: "https://auth.test/jwks",
  kuruAuthAlgorithms: ["RS256"],
  cloudflareAccessRequired: false,
  cloudflareTeamDomain: null,
  cloudflareAudience: null,
  rateLimitMax: 100,
  rateLimitWindow: "1 minute"
};

function fakePool(): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] })
  } as unknown as Pool;
}

function fakeDataService(): DataService {
  return {
    select: vi.fn().mockResolvedValue({ data: [], error: null, count: 0, status: 200 }),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  };
}

describe("Fastify application", () => {
  it("keeps health public and data routes authenticated", async () => {
    const dataService = fakeDataService();
    const app = await buildApp({
      config,
      pool: fakePool(),
      dataService,
      logger: false,
      kuruAuthVerifier: {
        verify: async (): Promise<AuthClaims> => ({
          sub: "user-a",
          org_id: null,
          roles: [],
          scopes: []
        })
      }
    });

    const health = await app.inject({ method: "GET", url: "/health/live" });
    expect(health.statusCode).toBe(200);

    const denied = await app.inject({ method: "GET", url: "/v1/data/records" });
    expect(denied.statusCode).toBe(401);

    const allowed = await app.inject({
      method: "GET",
      url: "/v1/data/records?count=exact",
      headers: { authorization: "Bearer test-token" }
    });
    expect(allowed.statusCode).toBe(200);
    expect(dataService.select).toHaveBeenCalledOnce();
    await app.close();
  });

  it("requires the administrative scope", async () => {
    const app = await buildApp({
      config,
      pool: fakePool(),
      dataService: fakeDataService(),
      logger: false,
      kuruAuthVerifier: {
        verify: async (): Promise<AuthClaims> => ({
          sub: "user-a",
          org_id: null,
          roles: [],
          scopes: []
        })
      }
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/status",
      headers: { authorization: "Bearer test-token" }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
