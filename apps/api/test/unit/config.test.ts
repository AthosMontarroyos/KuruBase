import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

const base = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost/kurubase"
};

describe("identity configuration", () => {
  it("requires an explicit identity provider", () => {
    expect(() => loadConfig(base)).toThrow();
  });

  it("loads Cloudflare Access as the sole MVP identity provider", () => {
    const config = loadConfig({
      ...base,
      IDENTITY_PROVIDER: "cloudflare-access",
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      CLOUDFLARE_ACCESS_AUDIENCE: "application-audience"
    });

    expect(config.identity).toEqual({
      mode: "cloudflare-access",
      teamDomain: "team.cloudflareaccess.com",
      issuer: "https://team.cloudflareaccess.com",
      audience: "application-audience"
    });
  });

  it("treats empty optional Compose values as unset", () => {
    const config = loadConfig({
      ...base,
      IDENTITY_PROVIDER: "local-jwt",
      LOCAL_JWT_SECRET: "a-development-only-secret-that-is-long-enough",
      OIDC_ISSUER: "",
      OIDC_AUDIENCE: "",
      OIDC_JWKS_URL: "",
      OIDC_ALLOWED_ALGORITHMS: "",
      KURUAUTH_ISSUER: "",
      KURUAUTH_AUDIENCE: "",
      KURUAUTH_JWKS_URL: "",
      KURUAUTH_ALLOWED_ALGORITHMS: "",
      CLOUDFLARE_ACCESS_REQUIRED: "",
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: "",
      CLOUDFLARE_ACCESS_AUDIENCE: ""
    });

    expect(config.identity.mode).toBe("local-jwt");
  });

  it("fails closed when the selected provider is incompletely configured", () => {
    expect(() =>
      loadConfig({
        ...base,
        IDENTITY_PROVIDER: "cloudflare-access",
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com"
      })
    ).toThrow("audience");
  });

  it("accepts KURUAUTH variables only as OIDC aliases", () => {
    const config = loadConfig({
      ...base,
      IDENTITY_PROVIDER: "oidc",
      KURUAUTH_ISSUER: "https://auth.test/",
      KURUAUTH_AUDIENCE: "kurubase",
      KURUAUTH_JWKS_URL: "https://auth.test/jwks",
      KURUAUTH_ALLOWED_ALGORITHMS: "RS256, ES256"
    });

    expect(config.identity).toEqual({
      mode: "oidc",
      issuer: "https://auth.test/",
      audience: "kurubase",
      jwksUrl: "https://auth.test/jwks",
      algorithms: ["RS256", "ES256"],
      access: null
    });
  });

  it("rejects conflicting OIDC and KURUAUTH aliases", () => {
    expect(() =>
      loadConfig({
        ...base,
        IDENTITY_PROVIDER: "oidc",
        OIDC_ISSUER: "https://identity.test",
        KURUAUTH_ISSUER: "https://auth.test",
        OIDC_AUDIENCE: "kurubase",
        OIDC_JWKS_URL: "https://identity.test/jwks"
      })
    ).toThrow("must not conflict");
  });

  it("requires dual Cloudflare verification for OIDC in production", () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "production",
        IDENTITY_PROVIDER: "oidc",
        OIDC_ISSUER: "https://auth.test",
        OIDC_AUDIENCE: "kurubase",
        OIDC_JWKS_URL: "https://auth.test/jwks"
      })
    ).toThrow("dual identity");

    const config = loadConfig({
      ...base,
      NODE_ENV: "production",
      IDENTITY_PROVIDER: "oidc",
      OIDC_ISSUER: "https://auth.test",
      OIDC_AUDIENCE: "kurubase",
      OIDC_JWKS_URL: "https://auth.test/jwks",
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      CLOUDFLARE_ACCESS_AUDIENCE: "application-audience"
    });
    expect(config.identity.mode).toBe("oidc");
    if (config.identity.mode === "oidc") {
      expect(config.identity.access?.issuer).toBe("https://team.cloudflareaccess.com");
    }
  });

  it("rejects local JWT in production and mixed provider settings", () => {
    const local = {
      ...base,
      IDENTITY_PROVIDER: "local-jwt",
      LOCAL_JWT_SECRET: "a-development-only-secret-that-is-long-enough"
    };
    expect(() => loadConfig({ ...local, NODE_ENV: "production" })).toThrow(
      "not allowed in production"
    );
    expect(() =>
      loadConfig({ ...local, OIDC_ISSUER: "https://auth.test" })
    ).toThrow("Only local JWT");
  });

  it("rejects symmetric or none algorithms for remote OIDC", () => {
    expect(() =>
      loadConfig({
        ...base,
        IDENTITY_PROVIDER: "oidc",
        OIDC_ISSUER: "https://auth.test",
        OIDC_AUDIENCE: "kurubase",
        OIDC_JWKS_URL: "https://auth.test/jwks",
        OIDC_ALLOWED_ALGORITHMS: "HS256,none"
      })
    ).toThrow("unsupported asymmetric algorithm");
  });
});
