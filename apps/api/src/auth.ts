import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTHeaderParameters,
  type JWTPayload,
  type JWTVerifyGetKey,
  type JWTVerifyOptions
} from "jose";
import { z } from "zod";
import type { AccessTokenVerifier, AuthClaims } from "./types.js";
import type { AppConfig } from "./config.js";
import { unauthorized } from "./errors.js";

const authClaimsSchema = z.object({
  sub: z.string().min(1),
  org_id: z.string().min(1).nullable().optional(),
  roles: z.array(z.string().min(1)).default([]),
  scopes: z.array(z.string().min(1)).default([])
});

class JoseVerifier<T> implements AccessTokenVerifier<T> {
  constructor(
    private readonly key: JWTVerifyGetKey,
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

export function createKuruAuthVerifier(
  config: Pick<
    AppConfig,
    "kuruAuthIssuer" | "kuruAuthAudience" | "kuruAuthJwksUrl" | "kuruAuthAlgorithms"
  >,
  key: JWTVerifyGetKey = createRemoteJWKSet(new URL(config.kuruAuthJwksUrl))
): AccessTokenVerifier<AuthClaims> {
  return new JoseVerifier(
    key,
    {
      issuer: config.kuruAuthIssuer,
      audience: config.kuruAuthAudience,
      algorithms: config.kuruAuthAlgorithms
    },
    (payload) => {
      const claims = authClaimsSchema.parse(payload);
      return {
        sub: claims.sub,
        org_id: claims.org_id ?? null,
        roles: claims.roles,
        scopes: claims.scopes
      };
    }
  );
}

export function createCloudflareAccessVerifier(
  teamDomain: string,
  audience: string
): AccessTokenVerifier<JWTPayload> {
  const issuer = `https://${teamDomain}`;
  const keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  return new JoseVerifier(keys, { issuer, audience, algorithms: ["RS256"] }, (payload) => payload);
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
