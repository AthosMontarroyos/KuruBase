import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey
} from "jose";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  PostgresPrincipalResolver,
  createCloudflareAccessIdentityProvider,
  createLocalJwtIdentityProvider,
  createMatchingIdentityProvider,
  createOidcIdentityProvider
} from "../../src/auth.js";
import type {
  IdentityProvider,
  IdentityRequest,
  PrincipalResolver,
  RlsIdentity
} from "../../src/types.js";

const accessSettings = {
  teamDomain: "team.cloudflareaccess.com",
  issuer: "https://team.cloudflareaccess.com",
  audience: "access-audience"
};
const PRINCIPAL_A = "11111111-1111-4111-8111-111111111111";
const PRINCIPAL_B = "22222222-2222-4222-8222-222222222222";

const mappedIdentity: RlsIdentity = {
  sub: PRINCIPAL_A,
  org_id: "org-a",
  roles: ["member"],
  scopes: ["kurubase:data:read"]
};

function request(headers: Record<string, string> = {}): IdentityRequest {
  return { headers };
}

async function signingKeys(): Promise<{
  privateKey: CryptoKey;
  keySet: JWTVerifyGetKey;
}> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  return {
    privateKey,
    keySet: createLocalJWKSet({ keys: [publicJwk] })
  };
}

async function accessToken(
  privateKey: CryptoKey,
  claims: {
    sub: string;
    common_name?: string;
    type?: string;
    audience?: string;
    issuer?: string;
    expiration?: string | number;
    issuedAt?: number;
  }
): Promise<string> {
  return new SignJWT({
    type: claims.type ?? "app",
    ...(claims.common_name ? { common_name: claims.common_name } : {})
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(claims.sub)
    .setIssuer(claims.issuer ?? accessSettings.issuer)
    .setAudience(claims.audience ?? accessSettings.audience)
    .setIssuedAt(claims.issuedAt)
    .setExpirationTime(claims.expiration ?? "5m")
    .sign(privateKey);
}

describe("Cloudflare Access identity", () => {
  it("maps a verified human subject to the canonical principal", async () => {
    const { privateKey, keySet } = await signingKeys();
    const resolve = vi.fn().mockResolvedValue(mappedIdentity);
    const provider = createCloudflareAccessIdentityProvider(
      accessSettings,
      { resolve },
      keySet
    );
    const token = await accessToken(privateKey, { sub: "access-user-a" });

    await expect(
      provider.authenticate(request({ "cf-access-jwt-assertion": token }))
    ).resolves.toEqual(mappedIdentity);
    expect(resolve).toHaveBeenCalledWith({
      provider: "cloudflare-access",
      issuer: accessSettings.issuer,
      subjectType: "human",
      subject: "access-user-a"
    });
  });

  it("uses common_name for a service token whose sub is empty", async () => {
    const { privateKey, keySet } = await signingKeys();
    const resolve = vi.fn().mockResolvedValue({
      ...mappedIdentity,
      roles: ["service"]
    });
    const provider = createCloudflareAccessIdentityProvider(
      accessSettings,
      { resolve },
      keySet
    );
    const token = await accessToken(privateKey, {
      sub: "",
      common_name: "client-id.access"
    });

    await provider.authenticate(request({ "cf-access-jwt-assertion": token }));
    expect(resolve).toHaveBeenCalledWith({
      provider: "cloudflare-access",
      issuer: accessSettings.issuer,
      subjectType: "service",
      subject: "client-id.access"
    });
  });

  it("rejects the wrong audience before resolving a principal", async () => {
    const { privateKey, keySet } = await signingKeys();
    const resolve = vi.fn().mockResolvedValue(mappedIdentity);
    const provider = createCloudflareAccessIdentityProvider(
      accessSettings,
      { resolve },
      keySet
    );
    const token = await accessToken(privateKey, {
      sub: "access-user-a",
      audience: "another-application"
    });

    await expect(
      provider.authenticate(request({ "cf-access-jwt-assertion": token }))
    ).rejects.toMatchObject({ statusCode: 401, code: "UNAUTHORIZED" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects missing headers and invalid signature, issuer, or lifetime", async () => {
    const { privateKey, keySet } = await signingKeys();
    const { privateKey: untrustedPrivateKey } = await signingKeys();
    const resolve = vi.fn().mockResolvedValue(mappedIdentity);
    const provider = createCloudflareAccessIdentityProvider(
      accessSettings,
      { resolve },
      keySet
    );
    const invalidSignature = await accessToken(untrustedPrivateKey, { sub: "access-user-a" });
    const invalidIssuer = await accessToken(privateKey, {
      sub: "access-user-a",
      issuer: "https://another.cloudflareaccess.com"
    });
    const expired = await accessToken(privateKey, {
      sub: "access-user-a",
      expiration: Math.floor(Date.now() / 1000) - 60
    });
    const issuedInTheFuture = await accessToken(privateKey, {
      sub: "access-user-a",
      issuedAt: Math.floor(Date.now() / 1000) + 300
    });

    await expect(provider.authenticate(request())).rejects.toMatchObject({ statusCode: 401 });
    for (const token of [invalidSignature, invalidIssuer, expired, issuedInTheFuture]) {
      await expect(
        provider.authenticate(request({ "cf-access-jwt-assertion": token }))
      ).rejects.toMatchObject({ statusCode: 401, code: "UNAUTHORIZED" });
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects org tokens and service tokens without a common name", async () => {
    const { privateKey, keySet } = await signingKeys();
    const provider = createCloudflareAccessIdentityProvider(
      accessSettings,
      { resolve: vi.fn().mockResolvedValue(mappedIdentity) },
      keySet
    );
    const orgToken = await accessToken(privateKey, { sub: "access-user-a", type: "org" });
    const incompleteServiceToken = await accessToken(privateKey, { sub: "" });

    await expect(
      provider.authenticate(request({ "cf-access-jwt-assertion": orgToken }))
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      provider.authenticate(request({ "cf-access-jwt-assertion": incompleteServiceToken }))
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("denies a verified but unmapped principal", async () => {
    const { privateKey, keySet } = await signingKeys();
    const provider = createCloudflareAccessIdentityProvider(
      accessSettings,
      { resolve: vi.fn().mockResolvedValue(null) },
      keySet
    );
    const token = await accessToken(privateKey, { sub: "unknown-user" });

    await expect(
      provider.authenticate(request({ "cf-access-jwt-assertion": token }))
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });
});

describe("OIDC and local JWT identity", () => {
  it("maps a verified OIDC subject instead of trusting authorization claims", async () => {
    const { privateKey, keySet } = await signingKeys();
    const resolve = vi.fn().mockResolvedValue(mappedIdentity);
    const provider = createOidcIdentityProvider(
      {
        issuer: "https://auth.test",
        audience: "kurubase",
        jwksUrl: "https://auth.test/jwks",
        algorithms: ["RS256"]
      },
      { resolve },
      keySet
    );
    const token = await new SignJWT({
      org_id: "attacker-controlled-org",
      roles: ["operator"],
      scopes: ["kurubase:admin"]
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("oidc-user-a")
      .setIssuer("https://auth.test")
      .setAudience("kurubase")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(
      provider.authenticate(request({ authorization: `Bearer ${token}` }))
    ).resolves.toEqual(mappedIdentity);
    expect(resolve).toHaveBeenCalledWith({
      provider: "oidc",
      issuer: "https://auth.test",
      subjectType: "human",
      subject: "oidc-user-a"
    });
  });

  it("rejects an OIDC token with the wrong audience before map lookup", async () => {
    const { privateKey, keySet } = await signingKeys();
    const resolve = vi.fn().mockResolvedValue(mappedIdentity);
    const provider = createOidcIdentityProvider(
      {
        issuer: "https://auth.test",
        audience: "kurubase",
        jwksUrl: "https://auth.test/jwks",
        algorithms: ["RS256"]
      },
      { resolve },
      keySet
    );
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("oidc-user-a")
      .setIssuer("https://auth.test")
      .setAudience("another-service")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(
      provider.authenticate(request({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({ statusCode: 401, code: "UNAUTHORIZED" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("validates canonical claims in local-jwt mode", async () => {
    const config = {
      issuer: "urn:kurubase:local",
      audience: "kurubase",
      secret: "a-development-only-secret-that-is-long-enough"
    };
    const provider = createLocalJwtIdentityProvider(config);
    const token = await new SignJWT({
      org_id: null,
      roles: ["member"],
      scopes: ["kurubase:data:write"]
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(PRINCIPAL_A)
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(config.secret));

    await expect(
      provider.authenticate(request({ authorization: `Bearer ${token}` }))
    ).resolves.toEqual({
      sub: PRINCIPAL_A,
      org_id: null,
      roles: ["member"],
      scopes: ["kurubase:data:write"]
    });
  });

  it("requires dual providers to resolve to the same canonical subject", async () => {
    const provider = createMatchingIdentityProvider(
      staticProvider({ ...mappedIdentity, sub: PRINCIPAL_A }),
      staticProvider({ ...mappedIdentity, sub: PRINCIPAL_B })
    );

    await expect(provider.authenticate(request())).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN"
    });
  });

  it("accepts different external providers only after both resolve to the same canonical sub", async () => {
    const accessAuthenticate = vi.fn().mockResolvedValue(mappedIdentity);
    const oidcAuthenticate = vi.fn().mockResolvedValue({ ...mappedIdentity });
    const provider = createMatchingIdentityProvider(
      { authenticate: accessAuthenticate },
      { authenticate: oidcAuthenticate }
    );

    await expect(provider.authenticate(request())).resolves.toEqual(mappedIdentity);
    expect(accessAuthenticate).toHaveBeenCalledOnce();
    expect(oidcAuthenticate).toHaveBeenCalledOnce();
  });
});

describe("Postgres principal resolver", () => {
  it("calls the private resolver function with the external identity tuple", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [mappedIdentity] });
    const resolver = new PostgresPrincipalResolver({ query } as unknown as Pick<Pool, "query">);
    const reference = {
      provider: "cloudflare-access" as const,
      issuer: accessSettings.issuer,
      subjectType: "human" as const,
      subject: "access-user-a"
    };

    await expect(resolver.resolve(reference)).resolves.toEqual(mappedIdentity);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "kurubase-resolve-principal-v1",
        values: [
          "cloudflare-access",
          accessSettings.issuer,
          "human",
          "access-user-a"
        ]
      })
    );
  });

  it("accepts a canonical UUID with empty role and scope arrays", async () => {
    const rolelessIdentity: RlsIdentity = {
      ...mappedIdentity,
      roles: [],
      scopes: []
    };
    const query = vi.fn().mockResolvedValue({ rows: [rolelessIdentity] });
    const resolver = new PostgresPrincipalResolver(
      { query } as unknown as Pick<Pool, "query">
    );

    await expect(
      resolver.resolve({
        provider: "cloudflare-access",
        issuer: accessSettings.issuer,
        subjectType: "human",
        subject: "access-user-a"
      })
    ).resolves.toEqual(rolelessIdentity);
  });

  it("returns null when the external identity is not mapped", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const resolver = new PostgresPrincipalResolver({ query } as unknown as Pick<Pool, "query">);

    await expect(
      resolver.resolve({
        provider: "oidc",
        issuer: "https://auth.test",
        subjectType: "human",
        subject: "unknown"
      })
    ).resolves.toBeNull();
  });

  it("rejects non-UUID canonical subjects and duplicate entitlements", async () => {
    const reference = {
      provider: "oidc" as const,
      issuer: "https://auth.test",
      subjectType: "human" as const,
      subject: "oidc-user-a"
    };
    const invalidRows = [
      { ...mappedIdentity, sub: "not-a-uuid" },
      { ...mappedIdentity, roles: ["member", "member"] },
      {
        ...mappedIdentity,
        scopes: ["kurubase:data:read", "kurubase:data:read"]
      }
    ];

    for (const row of invalidRows) {
      const query = vi.fn().mockResolvedValue({ rows: [row] });
      const resolver = new PostgresPrincipalResolver(
        { query } as unknown as Pick<Pool, "query">
      );
      await expect(resolver.resolve(reference)).rejects.toThrow(
        "invalid RLS identity"
      );
    }
  });
});

function staticProvider(identity: RlsIdentity): IdentityProvider {
  return { authenticate: async () => identity };
}
