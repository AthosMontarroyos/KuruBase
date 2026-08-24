import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const validator = fileURLToPath(
  new URL("../../../../scripts/verify-production-env.mjs", import.meta.url)
);

const apiPassword = "integration-api-password-bbbbbbbbbbb";
const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: `postgresql://kurubase_api:${apiPassword}@postgres:5432/kurubase`,
  POSTGRES_DB: "kurubase",
  POSTGRES_USER: "kurubase_owner",
  POSTGRES_PASSWORD: "integration-owner-password-aaaaaaaa",
  KURUBASE_API_PASSWORD: apiPassword,
  KURUBASE_IDENTITY_ADMIN_PASSWORD: "integration-admin-password-cccccccc",
  IDENTITY_PROVIDER: "oidc",
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: "synthetic.cloudflareaccess.com",
  CLOUDFLARE_ACCESS_AUDIENCE: "synthetic-access-audience",
  CLOUDFLARE_TUNNEL_TOKEN: "synthetic-tunnel-token"
};

function validate(environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [validator], {
    encoding: "utf8",
    env: environment
  });
}

describe("production environment validation", () => {
  it("accepts the provider-neutral OIDC variables", () => {
    const result = validate({
      ...validEnvironment,
      OIDC_ISSUER: "https://auth.kuru.invalid",
      OIDC_AUDIENCE: "kurubase",
      OIDC_JWKS_URL: "https://auth.kuru.invalid/.well-known/jwks.json"
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("accepts matching legacy KuruAuth aliases during migration", () => {
    const result = validate({
      ...validEnvironment,
      KURUAUTH_ISSUER: "https://auth.kuru.invalid",
      KURUAUTH_AUDIENCE: "kurubase",
      KURUAUTH_JWKS_URL: "https://auth.kuru.invalid/.well-known/jwks.json"
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects conflicting generic and legacy aliases", () => {
    const result = validate({
      ...validEnvironment,
      OIDC_ISSUER: "https://auth.kuru.invalid",
      KURUAUTH_ISSUER: "https://different.kuru.invalid",
      OIDC_AUDIENCE: "kurubase",
      KURUAUTH_AUDIENCE: "kurubase",
      OIDC_JWKS_URL: "https://auth.kuru.invalid/.well-known/jwks.json",
      KURUAUTH_JWKS_URL: "https://auth.kuru.invalid/.well-known/jwks.json"
    });

    expect(result.status).toBe(1);
  });
});
