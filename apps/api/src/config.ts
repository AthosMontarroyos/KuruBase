import { z } from "zod";
import type { IdentityProviderMode } from "./types.js";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

const identifier = z
  .string()
  .regex(/^[a-z_][a-z0-9_]*$/, "Must be a lowercase PostgreSQL identifier");

const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", {
  message: "Must use HTTPS"
});

const cloudflareTeamDomain = z
  .string()
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+cloudflareaccess\.com$/i,
    "Must be a Cloudflare Access team hostname without a scheme"
  );

function optionalEnvironmentValue<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => value === "" ? undefined : value, schema.optional());
}

const asymmetricAlgorithms = new Set([
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA"
]);

export function isSupportedOidcAlgorithm(algorithm: string): boolean {
  return asymmetricAlgorithms.has(algorithm);
}

const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    DATABASE_URL: z.string().url(),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
    EXPOSED_SCHEMA: identifier.default("api"),
    IDENTITY_PROVIDER: z.enum(["cloudflare-access", "oidc", "local-jwt"]),
    OIDC_ISSUER: optionalEnvironmentValue(httpsUrl),
    OIDC_AUDIENCE: optionalEnvironmentValue(z.string().min(1)),
    OIDC_JWKS_URL: optionalEnvironmentValue(httpsUrl),
    OIDC_ALLOWED_ALGORITHMS: optionalEnvironmentValue(z.string()),
    KURUAUTH_ISSUER: optionalEnvironmentValue(httpsUrl),
    KURUAUTH_AUDIENCE: optionalEnvironmentValue(z.string().min(1)),
    KURUAUTH_JWKS_URL: optionalEnvironmentValue(httpsUrl),
    KURUAUTH_ALLOWED_ALGORITHMS: optionalEnvironmentValue(z.string()),
    CLOUDFLARE_ACCESS_REQUIRED: optionalEnvironmentValue(booleanString),
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: optionalEnvironmentValue(cloudflareTeamDomain),
    CLOUDFLARE_ACCESS_AUDIENCE: optionalEnvironmentValue(z.string().min(1)),
    LOCAL_JWT_ISSUER: optionalEnvironmentValue(z.string().min(1)),
    LOCAL_JWT_AUDIENCE: optionalEnvironmentValue(z.string().min(1)),
    LOCAL_JWT_SECRET: optionalEnvironmentValue(z.string().min(32)),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(120),
    RATE_LIMIT_WINDOW: z.string().default("1 minute")
  })
  .superRefine((value, context) => {
    const addIssue = (message: string): void => {
      context.addIssue({ code: "custom", message });
    };
    const oidcValues = [
      value.OIDC_ISSUER,
      value.OIDC_AUDIENCE,
      value.OIDC_JWKS_URL,
      value.OIDC_ALLOWED_ALGORITHMS,
      value.KURUAUTH_ISSUER,
      value.KURUAUTH_AUDIENCE,
      value.KURUAUTH_JWKS_URL,
      value.KURUAUTH_ALLOWED_ALGORITHMS
    ];
    const accessValues = [
      value.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
      value.CLOUDFLARE_ACCESS_AUDIENCE
    ];
    const localValues = [
      value.LOCAL_JWT_ISSUER,
      value.LOCAL_JWT_AUDIENCE,
      value.LOCAL_JWT_SECRET
    ];

    if (value.IDENTITY_PROVIDER === "cloudflare-access") {
      if (!value.CLOUDFLARE_ACCESS_TEAM_DOMAIN || !value.CLOUDFLARE_ACCESS_AUDIENCE) {
        addIssue("Cloudflare Access team domain and audience are required for cloudflare-access identity");
      }
      if (value.CLOUDFLARE_ACCESS_REQUIRED === false) {
        addIssue("Cloudflare Access cannot be disabled when it is the identity provider");
      }
      if (oidcValues.some((entry) => entry !== undefined) || localValues.some((entry) => entry !== undefined)) {
        addIssue("Only Cloudflare Access identity settings may be configured in cloudflare-access mode");
      }
    }

    if (value.IDENTITY_PROVIDER === "oidc") {
      if (!effectiveAlias(value.OIDC_ISSUER, value.KURUAUTH_ISSUER)) {
        addIssue("OIDC_ISSUER or its KURUAUTH_ISSUER alias is required in oidc mode");
      }
      if (!effectiveAlias(value.OIDC_AUDIENCE, value.KURUAUTH_AUDIENCE)) {
        addIssue("OIDC_AUDIENCE or its KURUAUTH_AUDIENCE alias is required in oidc mode");
      }
      if (!effectiveAlias(value.OIDC_JWKS_URL, value.KURUAUTH_JWKS_URL)) {
        addIssue("OIDC_JWKS_URL or its KURUAUTH_JWKS_URL alias is required in oidc mode");
      }
      validateAliasPair(context, "issuer", value.OIDC_ISSUER, value.KURUAUTH_ISSUER);
      validateAliasPair(context, "audience", value.OIDC_AUDIENCE, value.KURUAUTH_AUDIENCE);
      validateAliasPair(context, "JWKS URL", value.OIDC_JWKS_URL, value.KURUAUTH_JWKS_URL);
      validateAliasPair(
        context,
        "allowed algorithms",
        normalizeAlgorithmList(value.OIDC_ALLOWED_ALGORITHMS),
        normalizeAlgorithmList(value.KURUAUTH_ALLOWED_ALGORITHMS)
      );
      if (localValues.some((entry) => entry !== undefined)) {
        addIssue("Local JWT settings cannot be configured in oidc mode");
      }

      const accessRequired =
        value.CLOUDFLARE_ACCESS_REQUIRED ?? value.NODE_ENV === "production";
      if (
        accessRequired &&
        (!value.CLOUDFLARE_ACCESS_TEAM_DOMAIN || !value.CLOUDFLARE_ACCESS_AUDIENCE)
      ) {
        addIssue("Cloudflare Access settings are required for dual identity verification");
      }
      if (!accessRequired && accessValues.some((entry) => entry !== undefined)) {
        addIssue("Set CLOUDFLARE_ACCESS_REQUIRED=true when configuring Access in oidc mode");
      }
      if (value.NODE_ENV === "production" && value.CLOUDFLARE_ACCESS_REQUIRED === false) {
        addIssue("Cloudflare Access verification cannot be disabled in production");
      }
    }

    if (value.IDENTITY_PROVIDER === "local-jwt") {
      if (value.NODE_ENV === "production") {
        addIssue("local-jwt identity is not allowed in production");
      }
      if (!value.LOCAL_JWT_SECRET) {
        addIssue("LOCAL_JWT_SECRET is required in local-jwt mode");
      }
      if (
        oidcValues.some((entry) => entry !== undefined) ||
        accessValues.some((entry) => entry !== undefined) ||
        value.CLOUDFLARE_ACCESS_REQUIRED !== undefined
      ) {
        addIssue("Only local JWT identity settings may be configured in local-jwt mode");
      }
    }

    const configuredAlgorithms = effectiveAlias(
      normalizeAlgorithmList(value.OIDC_ALLOWED_ALGORITHMS),
      normalizeAlgorithmList(value.KURUAUTH_ALLOWED_ALGORITHMS)
    );
    if (
      value.IDENTITY_PROVIDER === "oidc" &&
      configuredAlgorithms?.some((algorithm) => !isSupportedOidcAlgorithm(algorithm))
    ) {
      addIssue("OIDC_ALLOWED_ALGORITHMS contains an unsupported asymmetric algorithm");
    }
  });

export interface CloudflareAccessSettings {
  teamDomain: string;
  issuer: string;
  audience: string;
}

export interface CloudflareAccessIdentityConfig extends CloudflareAccessSettings {
  mode: "cloudflare-access";
}

export interface OidcIdentityConfig {
  mode: "oidc";
  issuer: string;
  audience: string;
  jwksUrl: string;
  algorithms: string[];
  access: CloudflareAccessSettings | null;
}

export interface LocalJwtIdentityConfig {
  mode: "local-jwt";
  issuer: string;
  audience: string;
  secret: string;
}

export type IdentityConfig =
  | CloudflareAccessIdentityConfig
  | OidcIdentityConfig
  | LocalJwtIdentityConfig;

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  dbPoolMax: number;
  statementTimeoutMs: number;
  exposedSchema: string;
  identity: IdentityConfig;
  rateLimitMax: number;
  rateLimitWindow: string;
}

function effectiveAlias<T>(primary: T | undefined, legacy: T | undefined): T | undefined {
  return primary ?? legacy;
}

function validateAliasPair<T>(
  context: z.RefinementCtx,
  name: string,
  primary: T | undefined,
  legacy: T | undefined
): void {
  if (
    primary !== undefined &&
    legacy !== undefined &&
    JSON.stringify(primary) !== JSON.stringify(legacy)
  ) {
    context.addIssue({
      code: "custom",
      message: `OIDC and KURUAUTH ${name} aliases must not conflict`
    });
  }
}

function normalizeAlgorithmList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value
    .split(",")
    .map((algorithm) => algorithm.trim())
    .filter(Boolean);
}

function accessSettings(teamDomain: string, audience: string): CloudflareAccessSettings {
  return {
    teamDomain,
    issuer: `https://${teamDomain}`,
    audience
  };
}

function buildIdentityConfig(
  mode: IdentityProviderMode,
  value: z.infer<typeof configSchema>
): IdentityConfig {
  if (mode === "cloudflare-access") {
    return {
      mode,
      ...accessSettings(
        value.CLOUDFLARE_ACCESS_TEAM_DOMAIN as string,
        value.CLOUDFLARE_ACCESS_AUDIENCE as string
      )
    };
  }

  if (mode === "oidc") {
    const algorithms =
      effectiveAlias(
        normalizeAlgorithmList(value.OIDC_ALLOWED_ALGORITHMS),
        normalizeAlgorithmList(value.KURUAUTH_ALLOWED_ALGORITHMS)
      ) ?? ["RS256"];
    if (algorithms.length === 0) {
      throw new Error("At least one OIDC JWT algorithm must be configured");
    }
    const accessRequired =
      value.CLOUDFLARE_ACCESS_REQUIRED ?? value.NODE_ENV === "production";
    return {
      mode,
      issuer: effectiveAlias(value.OIDC_ISSUER, value.KURUAUTH_ISSUER) as string,
      audience: effectiveAlias(value.OIDC_AUDIENCE, value.KURUAUTH_AUDIENCE) as string,
      jwksUrl: effectiveAlias(value.OIDC_JWKS_URL, value.KURUAUTH_JWKS_URL) as string,
      algorithms,
      access: accessRequired
        ? accessSettings(
            value.CLOUDFLARE_ACCESS_TEAM_DOMAIN as string,
            value.CLOUDFLARE_ACCESS_AUDIENCE as string
          )
        : null
    };
  }

  return {
    mode,
    issuer: value.LOCAL_JWT_ISSUER ?? "urn:kurubase:local",
    audience: value.LOCAL_JWT_AUDIENCE ?? "kurubase",
    secret: value.LOCAL_JWT_SECRET as string
  };
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const value = configSchema.parse(environment);
  return {
    nodeEnv: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    dbPoolMax: value.DB_POOL_MAX,
    statementTimeoutMs: value.DB_STATEMENT_TIMEOUT_MS,
    exposedSchema: value.EXPOSED_SCHEMA,
    identity: buildIdentityConfig(value.IDENTITY_PROVIDER, value),
    rateLimitMax: value.RATE_LIMIT_MAX,
    rateLimitWindow: value.RATE_LIMIT_WINDOW
  };
}
