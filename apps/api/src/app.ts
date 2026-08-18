import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { JWTPayload } from "jose";
import type { Pool } from "pg";
import type { AppConfig } from "./config.js";
import type { AccessTokenVerifier, AuthClaims, DataEnvelope } from "./types.js";
import type { DataService } from "./db/data-service.js";
import { PostgresDataService } from "./db/data-service.js";
import { AppError, unauthorized } from "./errors.js";
import { readBearerToken } from "./auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerDataRoutes } from "./routes/data.js";
import { registerAdminRoutes } from "./routes/admin.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthClaims;
  }
}

export interface BuildAppDependencies {
  config: AppConfig;
  pool: Pool;
  kuruAuthVerifier: AccessTokenVerifier<AuthClaims>;
  cloudflareVerifier?: AccessTokenVerifier<JWTPayload>;
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
  if (config.cloudflareAccessRequired && !dependencies.cloudflareVerifier) {
    throw new Error("Cloudflare Access verification is required but no verifier was configured");
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

  await app.register(async (protectedApp) => {
    protectedApp.addHook("onRequest", async (request) => {
      if (config.cloudflareAccessRequired) {
        const header = request.headers["cf-access-jwt-assertion"];
        if (typeof header !== "string") throw unauthorized("Cloudflare Access authentication is required");
        await dependencies.cloudflareVerifier?.verify(header);
      }
      const token = readBearerToken(request.headers.authorization);
      request.auth = await dependencies.kuruAuthVerifier.verify(token);
    });

    const dataService =
      dependencies.dataService ??
      new PostgresDataService(pool, config.exposedSchema, config.statementTimeoutMs);
    await registerDataRoutes(protectedApp, dataService);
    await registerAdminRoutes(protectedApp);
  });

  return app;
}
