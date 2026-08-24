import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTHeaderParameters,
  type JWTPayload,
  type JWTVerifyGetKey,
  type JWTVerifyOptions,
  type KeyInput
} from "jose";
import type { Pool, QueryResultRow } from "pg";
import { z } from "zod";
import type {
  CloudflareAccessSettings,
  IdentityConfig,
  LocalJwtIdentityConfig,
  OidcIdentityConfig
} from "./config.js";
import { isSupportedOidcAlgorithm } from "./config.js";
import { forbidden, unauthorized } from "./errors.js";
import {
  KURUBASE_ROLES,
  KURUBASE_SCOPES,
  type AccessTokenVerifier,
  type ExternalIdentityReference,
  type IdentityProvider,
  type IdentityRequest,
  type PrincipalResolver,
  type RlsIdentity
} from "./types.js";

type VerificationKey = KeyInput | JWTVerifyGetKey;
const MAX_FUTURE_IAT_SECONDS = 60;

const rlsIdentitySchema = z.object({
  sub: z.string().uuid(),
  org_id: z.string().min(1).nullable().optional(),
  roles: z
    .array(z.enum(KURUBASE_ROLES))
    .max(32)
    .refine(hasUniqueValues, { message: "Roles must not contain duplicates" })
    .default([]),
  scopes: z
    .array(z.enum(KURUBASE_SCOPES))
    .max(64)
    .refine(hasUniqueValues, { message: "Scopes must not contain duplicates" })
    .default([])
});

const cloudflareAccessClaimsSchema = z.object({
  type: z.literal("app"),
  sub: z.string(),
  common_name: z.string().min(1).optional()
});

const oidcSubjectSchema = z.object({
  sub: z.string().min(1)
});

class JoseVerifier<T> implements AccessTokenVerifier<T> {
  constructor(
    private readonly key: VerificationKey,
    private readonly options: JWTVerifyOptions,
    private readonly parse: (payload: JWTPayload, header: JWTHeaderParameters) => T
  ) {}

  async verify(token: string): Promise<T> {
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.key, this.options);
      return this.parse(payload, protectedHeader);
    } catch {
      throw unauthorized("The access token is invalid or expired");
    }
  }
}

export class PostgresPrincipalResolver implements PrincipalResolver {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async resolve(reference: ExternalIdentityReference): Promise<RlsIdentity | null> {
    const result = await this.pool.query<PrincipalRow>({
      name: "kurubase-resolve-principal-v1",
      text: `
        select sub, org_id, roles, scopes
        from kurubase_private.resolve_principal(
          $1::text,
          $2::text,
          $3::text,
          $4::text
        )
      `,
      values: [reference.provider, reference.issuer, reference.subjectType, reference.subject]
    });
    const row = result.rows[0];
    if (!row) return null;
    return parseResolvedIdentity(row);
  }
}

interface PrincipalRow extends QueryResultRow {
  sub: unknown;
  org_id: unknown;
  roles: unknown;
  scopes: unknown;
}

export function createCloudflareAccessVerifier(
  teamDomain: string,
  audience: string,
  key?: VerificationKey
): AccessTokenVerifier<JWTPayload> {
  const issuer = `https://${teamDomain}`;
  const verificationKey =
    key ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  return new JoseVerifier(
    verificationKey,
    {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "iat", "exp", "type"]
    },
    (payload) => {
      assertIssuedAt(payload);
      cloudflareAccessClaimsSchema.parse(payload);
      return payload;
    }
  );
}

export function createCloudflareAccessIdentityProvider(
  config: CloudflareAccessSettings,
  resolver: PrincipalResolver,
  key?: VerificationKey
): IdentityProvider {
  if (config.issuer !== `https://${config.teamDomain}`) {
    throw new Error("Cloudflare Access issuer must match the configured team domain");
  }
  const verifier = createCloudflareAccessVerifier(config.teamDomain, config.audience, key);
  return {
    async authenticate(request): Promise<RlsIdentity> {
      const token = readSingleHeader(
        request,
        "cf-access-jwt-assertion",
        "Cloudflare Access authentication is required"
      );
      const payload = await verifier.verify(token);
      const reference = cloudflareReference(payload, config.issuer);
      return resolvePrincipal(resolver, reference);
    }
  };
}

export function createOidcIdentityProvider(
  config: Pick<OidcIdentityConfig, "issuer" | "audience" | "jwksUrl" | "algorithms">,
  resolver: PrincipalResolver,
  key: VerificationKey = createRemoteJWKSet(new URL(config.jwksUrl))
): IdentityProvider {
  assertOidcAlgorithms(config.algorithms);
  const verifier = new JoseVerifier(
    key,
    {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: config.algorithms,
      requiredClaims: ["sub", "iat", "exp"]
    },
    (payload) => {
      assertIssuedAt(payload);
      return payload;
    }
  );

  return {
    async authenticate(request): Promise<RlsIdentity> {
      const authorization = request.headers.authorization;
      const token = readBearerToken(typeof authorization === "string" ? authorization : undefined);
      const payload = await verifier.verify(token);
      const { sub } = parseOidcSubject(payload);
      return resolvePrincipal(resolver, {
        provider: "oidc",
        issuer: config.issuer,
        subjectType: "human",
        subject: sub
      });
    }
  };
}

export function createLocalJwtIdentityProvider(
  config: Pick<LocalJwtIdentityConfig, "issuer" | "audience" | "secret">
): IdentityProvider {
  if (new TextEncoder().encode(config.secret).byteLength < 32) {
    throw new Error("The local JWT secret must contain at least 32 bytes");
  }
  const verifier = new JoseVerifier(
    new TextEncoder().encode(config.secret),
    {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["HS256"],
      requiredClaims: ["sub", "iat", "exp"]
    },
    (payload) => parseTokenIdentity(payload)
  );
  return {
    async authenticate(request): Promise<RlsIdentity> {
      const authorization = request.headers.authorization;
      return verifier.verify(
        readBearerToken(typeof authorization === "string" ? authorization : undefined)
      );
    }
  };
}

export function createMatchingIdentityProvider(
  accessProvider: IdentityProvider,
  oidcProvider: IdentityProvider
): IdentityProvider {
  return {
    async authenticate(request): Promise<RlsIdentity> {
      const [accessIdentity, oidcIdentity] = await Promise.all([
        accessProvider.authenticate(request),
        oidcProvider.authenticate(request)
      ]);
      // Both subjects are canonical resolver outputs; external email claims never enter this check.
      if (accessIdentity.sub !== oidcIdentity.sub) {
        throw forbidden("The Cloudflare Access and OIDC identities do not match");
      }
      return accessIdentity;
    }
  };
}

export interface IdentityProviderFactoryKeys {
  access?: VerificationKey;
  oidc?: VerificationKey;
}

export function createIdentityProvider(
  config: IdentityConfig,
  resolver: PrincipalResolver,
  keys: IdentityProviderFactoryKeys = {}
): IdentityProvider {
  if (config.mode === "cloudflare-access") {
    return createCloudflareAccessIdentityProvider(config, resolver, keys.access);
  }
  if (config.mode === "local-jwt") {
    return createLocalJwtIdentityProvider(config);
  }

  const oidc = createOidcIdentityProvider(config, resolver, keys.oidc);
  if (!config.access) return oidc;
  const access = createCloudflareAccessIdentityProvider(config.access, resolver, keys.access);
  return createMatchingIdentityProvider(access, oidc);
}

export function cloudflareReference(
  payload: JWTPayload,
  issuer: string
): ExternalIdentityReference {
  try {
    const claims = cloudflareAccessClaimsSchema.parse(payload);
    if (claims.sub.length > 0) {
      return {
        provider: "cloudflare-access",
        issuer,
        subjectType: "human",
        subject: claims.sub
      };
    }
    if (!claims.common_name) {
      throw new Error("Missing service token common name");
    }
    return {
      provider: "cloudflare-access",
      issuer,
      subjectType: "service",
      subject: claims.common_name
    };
  } catch {
    throw unauthorized("The Cloudflare Access token has invalid identity claims");
  }
}

function parseOidcSubject(payload: JWTPayload): { sub: string } {
  try {
    return oidcSubjectSchema.parse(payload);
  } catch {
    throw unauthorized("The OIDC token has invalid identity claims");
  }
}

function parseTokenIdentity(payload: JWTPayload): RlsIdentity {
  try {
    assertIssuedAt(payload);
    const identity = rlsIdentitySchema.parse(payload);
    return {
      sub: identity.sub,
      org_id: identity.org_id ?? null,
      roles: identity.roles,
      scopes: identity.scopes
    };
  } catch {
    throw unauthorized("The access token has invalid identity claims");
  }
}

function assertIssuedAt(payload: JWTPayload): void {
  if (
    typeof payload.iat !== "number" ||
    payload.iat > Math.floor(Date.now() / 1000) + MAX_FUTURE_IAT_SECONDS
  ) {
    throw new Error("Invalid token issuance time");
  }
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function parseResolvedIdentity(value: unknown): RlsIdentity {
  const result = rlsIdentitySchema.safeParse(value);
  if (!result.success) {
    throw new Error("The principal resolver returned an invalid RLS identity");
  }
  return {
    sub: result.data.sub,
    org_id: result.data.org_id ?? null,
    roles: result.data.roles,
    scopes: result.data.scopes
  };
}

async function resolvePrincipal(
  resolver: PrincipalResolver,
  reference: ExternalIdentityReference
): Promise<RlsIdentity> {
  const identity = await resolver.resolve(reference);
  if (!identity) {
    throw forbidden("The authenticated principal is not authorized for KuruBase");
  }
  return parseResolvedIdentity(identity);
}

function readSingleHeader(request: IdentityRequest, name: string, message: string): string {
  const value = request.headers[name];
  if (typeof value !== "string" || value.length === 0) {
    throw unauthorized(message);
  }
  return value;
}

function assertOidcAlgorithms(algorithms: string[]): void {
  if (
    algorithms.length === 0 ||
    algorithms.some((algorithm) => !isSupportedOidcAlgorithm(algorithm))
  ) {
    throw new Error("OIDC requires at least one supported asymmetric JWT algorithm");
  }
}

export function readBearerToken(header: string | undefined): string {
  if (!header) {
    throw unauthorized();
  }
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match?.[1]) {
    throw unauthorized("Authorization must use the Bearer scheme");
  }
  return match[1];
}
