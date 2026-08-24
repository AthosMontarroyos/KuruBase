import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { Pool } from "pg";
import type { AppConfig } from "./config.js";
import type { DataEnvelope, IdentityProvider, RlsIdentity } from "./types.js";
import type { DataService } from "./db/data-service.js";
import { PostgresDataService } from "./db/data-service.js";
import { AppError } from "./errors.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerDataRoutes } from "./routes/data.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerIdentityRoutes } from "./routes/identity.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: RlsIdentity;
  }
}

export interface BuildAppDependencies {
  config: AppConfig;
  pool: Pool;
  identityProvider: IdentityProvider;
  dataService?: DataService;
  logger?: boolean;
}

function errorEnvelope(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): DataEnvelope<never> {
  const error = details ? { code, message, details } : { code, message };
  return { data: null, error, count: null, status };
}

export async function buildApp(dependencies: BuildAppDependencies): Promise<FastifyInstance> {
  const { config, pool } = dependencies;
  const { identityProvider } = dependencies;
  if (!identityProvider) {
    throw new Error("An identity provider must be configured");
  }

  const app = Fastify({
    logger: (dependencies.logger ?? config.nodeEnv !== "test")
      ? {
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.headers.cf-access-jwt-assertion",
              "res.headers.set-cookie"
            ],
            censor: "[REDACTED]"
          }
        }
      : false,
    bodyLimit: 1_048_576,
    requestTimeout: 15_000
  });

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send(
        errorEnvelope(400, "VALIDATION_ERROR", "The request is invalid", {
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        })
      );
    }
    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send(errorEnvelope(error.statusCode, error.code, error.message, error.details));
    }
    const databaseCode = (error as { code?: string }).code;
    if (databaseCode === "42501") {
      return reply.code(403).send(errorEnvelope(403, "FORBIDDEN", "The database policy denied this request"));
    }
    if (databaseCode === "23505") {
      return reply.code(409).send(errorEnvelope(409, "CONFLICT", "A unique constraint rejected this request"));
    }
    request.log.error({ code: databaseCode ?? "INTERNAL_ERROR" }, "Request failed");
    return reply.code(500).send(errorEnvelope(500, "INTERNAL_ERROR", "The request could not be completed"));
  });

  await registerHealthRoutes(app, pool);
  await registerDashboardRoutes(app);

  await app.register(async (protectedApp) => {
    protectedApp.addHook("onRequest", async (request) => {
      request.auth = await identityProvider.authenticate(request);
    });

    const dataService =
      dependencies.dataService ??
      new PostgresDataService(pool, config.exposedSchema, config.statementTimeoutMs);
    await registerIdentityRoutes(protectedApp);
    await registerDataRoutes(protectedApp, dataService);
    await registerAdminRoutes(protectedApp);
  });

  return app;
}
