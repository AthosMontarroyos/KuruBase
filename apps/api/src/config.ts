import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const identifier = z
  .string()
  .regex(/^[a-z_][a-z0-9_]*$/, "Must be a lowercase PostgreSQL identifier");

const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    DATABASE_URL: z.string().url(),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
    EXPOSED_SCHEMA: identifier.default("api"),
    KURUAUTH_ISSUER: z.string().url(),
    KURUAUTH_AUDIENCE: z.string().min(1),
    KURUAUTH_JWKS_URL: z.string().url(),
    KURUAUTH_ALLOWED_ALGORITHMS: z.string().default("RS256"),
    CLOUDFLARE_ACCESS_REQUIRED: booleanString.default(false),
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: z.string().optional(),
    CLOUDFLARE_ACCESS_AUDIENCE: z.string().optional(),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(120),
    RATE_LIMIT_WINDOW: z.string().default("1 minute")
  })
  .superRefine((value, context) => {
    if (
      value.CLOUDFLARE_ACCESS_REQUIRED &&
      (!value.CLOUDFLARE_ACCESS_TEAM_DOMAIN || !value.CLOUDFLARE_ACCESS_AUDIENCE)
    ) {
      context.addIssue({
        code: "custom",
        message: "Cloudflare Access domain and audience are required when Access verification is enabled"
      });
    }
    if (value.NODE_ENV === "production" && !value.CLOUDFLARE_ACCESS_REQUIRED) {
      context.addIssue({
        code: "custom",
        message: "Cloudflare Access verification must be enabled in production"
      });
    }
  });

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  dbPoolMax: number;
  statementTimeoutMs: number;
  exposedSchema: string;
  kuruAuthIssuer: string;
  kuruAuthAudience: string;
  kuruAuthJwksUrl: string;
  kuruAuthAlgorithms: string[];
  cloudflareAccessRequired: boolean;
  cloudflareTeamDomain: string | null;
  cloudflareAudience: string | null;
  rateLimitMax: number;
  rateLimitWindow: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const value = configSchema.parse(environment);
  const algorithms = value.KURUAUTH_ALLOWED_ALGORITHMS
    .split(",")
    .map((algorithm) => algorithm.trim())
    .filter(Boolean);

  if (algorithms.length === 0) {
    throw new Error("At least one KuruAuth JWT algorithm must be configured");
  }

  return {
    nodeEnv: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    dbPoolMax: value.DB_POOL_MAX,
    statementTimeoutMs: value.DB_STATEMENT_TIMEOUT_MS,
    exposedSchema: value.EXPOSED_SCHEMA,
    kuruAuthIssuer: value.KURUAUTH_ISSUER,
    kuruAuthAudience: value.KURUAUTH_AUDIENCE,
    kuruAuthJwksUrl: value.KURUAUTH_JWKS_URL,
    kuruAuthAlgorithms: algorithms,
    cloudflareAccessRequired: value.CLOUDFLARE_ACCESS_REQUIRED,
    cloudflareTeamDomain: value.CLOUDFLARE_ACCESS_TEAM_DOMAIN ?? null,
    cloudflareAudience: value.CLOUDFLARE_ACCESS_AUDIENCE ?? null,
    rateLimitMax: value.RATE_LIMIT_MAX,
    rateLimitWindow: value.RATE_LIMIT_WINDOW
  };
}
