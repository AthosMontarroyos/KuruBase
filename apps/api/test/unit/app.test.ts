import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";
import type { DataService } from "../../src/db/data-service.js";
import { unauthorized } from "../../src/errors.js";
import type { IdentityProvider, RlsIdentity } from "../../src/types.js";

const config: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 8080,
  databaseUrl: "postgresql://unused",
  dbPoolMax: 2,
  statementTimeoutMs: 5000,
  exposedSchema: "api",
  identity: {
    mode: "local-jwt",
    issuer: "urn:kurubase:local",
    audience: "kurubase",
    secret: "a-development-only-secret-that-is-long-enough"
  },
  rateLimitMax: 100,
  rateLimitWindow: "1 minute"
};

const baseIdentity: RlsIdentity = {
  sub: "11111111-1111-4111-8111-111111111111",
  org_id: "org-a",
  roles: ["member"],
  scopes: ["kurubase:data:read"]
};

function fakePool(): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] })
  } as unknown as Pool;
}

function fakeDataService(): DataService {
  return {
    select: vi.fn().mockResolvedValue({ data: [], error: null, count: 0, status: 200 }),
    insert: vi.fn().mockResolvedValue({ data: [], error: null, count: 0, status: 201 }),
    update: vi.fn().mockResolvedValue({ data: [], error: null, count: 0, status: 200 }),
    delete: vi.fn().mockResolvedValue({ data: [], error: null, count: 0, status: 200 })
  };
}

function provider(identity: RlsIdentity): IdentityProvider {
  return {
    async authenticate(request) {
      if (!request.headers.authorization) throw unauthorized();
      return identity;
    }
  };
}

describe("Fastify application identity", () => {
  it("serves the dashboard from the API origin with restrictive browser headers", async () => {
    const originalWorkingDirectory = process.cwd();
    process.chdir(resolve(originalWorkingDirectory, "apps/api"));
    const app = await buildApp({
      config,
      pool: fakePool(),
      dataService: fakeDataService(),
      logger: false,
      identityProvider: provider(baseIdentity)
    }).finally(() => process.chdir(originalWorkingDirectory));

    const page = await app.inject({ method: "GET", url: "/" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(page.headers["x-content-type-options"]).toBe("nosniff");
    expect(page.body).toContain('<script type="module" src="/bootstrap.js"></script>');

    const script = await app.inject({ method: "GET", url: "/bootstrap.js" });
    expect(script.statusCode).toBe(200);
    expect(script.headers["content-type"]).toContain("text/javascript");

    const favicon = await app.inject({ method: "GET", url: "/favicon.ico" });
    expect(favicon.statusCode).toBe(204);
    expect(favicon.headers["x-content-type-options"]).toBe("nosniff");
    await app.close();
  });

  it("keeps health public and data routes authenticated", async () => {
    const dataService = fakeDataService();
    const app = await buildApp({
      config,
      pool: fakePool(),
      dataService,
      logger: false,
      identityProvider: provider(baseIdentity)
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

  it("returns the canonical identity from /v1/me without requiring an application role", async () => {
    const rolelessIdentity: RlsIdentity = {
      ...baseIdentity,
      roles: [],
      scopes: []
    };
    const app = await buildApp({
      config,
      pool: fakePool(),
      dataService: fakeDataService(),
      logger: false,
      identityProvider: provider(rolelessIdentity)
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer test-token" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(rolelessIdentity);
    await app.close();
  });

  it("denies a roleless principal even when the required scope is present", async () => {
    const app = await buildApp({
      config,
      pool: fakePool(),
      dataService: fakeDataService(),
      logger: false,
      identityProvider: provider({
        ...baseIdentity,
        roles: [],
        scopes: ["kurubase:data:read", "kurubase:admin"]
      })
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/data/records",
      headers: { authorization: "Bearer test-token" }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.message).toContain("role");

    const adminResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/status",
      headers: { authorization: "Bearer test-token" }
    });
    expect(adminResponse.statusCode).toBe(403);
    expect(adminResponse.json().error.message).toContain("role");
    await app.close();
  });

  it("does not let a read scope authorize mutations", async () => {
    const dataService = fakeDataService();
    const app = await buildApp({
      config,
      pool: fakePool(),
      dataService,
      logger: false,
      identityProvider: provider(baseIdentity)
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/data/records",
      headers: { authorization: "Bearer test-token" },
      payload: { data: { source: "test" } }
    });
    expect(response.statusCode).toBe(403);
    expect(dataService.insert).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows data mutations only with the write scope and an allowed role", async () => {
    const dataService = fakeDataService();
    const app = await buildApp({
      config,
      pool: fakePool(),
      dataService,
      logger: false,
      identityProvider: provider({
        ...baseIdentity,
        scopes: ["kurubase:data:write"]
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/data/records",
      headers: { authorization: "Bearer test-token" },
      payload: { data: { source: "test" } }
    });
    expect(response.statusCode).toBe(201);
    expect(dataService.insert).toHaveBeenCalledOnce();
    await app.close();
  });

  it("requires the administrative scope and an allowed role", async () => {
    const deniedApp = await buildApp({
      config,
      pool: fakePool(),
      dataService: fakeDataService(),
      logger: false,
      identityProvider: provider(baseIdentity)
    });
    const denied = await deniedApp.inject({
      method: "GET",
      url: "/v1/admin/status",
      headers: { authorization: "Bearer test-token" }
    });
    expect(denied.statusCode).toBe(403);
    await deniedApp.close();

    const allowedApp = await buildApp({
      config,
      pool: fakePool(),
      dataService: fakeDataService(),
      logger: false,
      identityProvider: provider({
        ...baseIdentity,
        roles: ["operator"],
        scopes: ["kurubase:admin"]
      })
    });
    const allowed = await allowedApp.inject({
      method: "GET",
      url: "/v1/admin/status",
      headers: { authorization: "Bearer test-token" }
    });
    expect(allowed.statusCode).toBe(200);
    await allowedApp.close();
  });

  it("fails closed when no identity provider is injected", async () => {
    await expect(
      buildApp({
        config,
        pool: fakePool(),
        dataService: fakeDataService(),
        logger: false,
        identityProvider: undefined as unknown as IdentityProvider
      })
    ).rejects.toThrow("identity provider");
  });
});
