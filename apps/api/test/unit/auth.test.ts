import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair
} from "jose";
import { describe, expect, it } from "vitest";
import { createKuruAuthVerifier } from "../../src/auth.js";

describe("KuruAuth verification", () => {
  it("validates signature, issuer, audience, algorithm, and claims", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "test-key";
    publicJwk.alg = "RS256";
    const verifier = createKuruAuthVerifier(
      {
        kuruAuthIssuer: "https://auth.test",
        kuruAuthAudience: "kurubase",
        kuruAuthJwksUrl: "https://auth.test/jwks",
        kuruAuthAlgorithms: ["RS256"]
      },
      createLocalJWKSet({ keys: [publicJwk] })
    );
    const token = await new SignJWT({
      org_id: "org-a",
      roles: ["member"],
      scopes: ["records:read"]
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("user-a")
      .setIssuer("https://auth.test")
      .setAudience("kurubase")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(verifier.verify(token)).resolves.toEqual({
      sub: "user-a",
      org_id: "org-a",
      roles: ["member"],
      scopes: ["records:read"]
    });
  });

  it("rejects the wrong audience", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "test-key";
    const verifier = createKuruAuthVerifier(
      {
        kuruAuthIssuer: "https://auth.test",
        kuruAuthAudience: "kurubase",
        kuruAuthJwksUrl: "https://auth.test/jwks",
        kuruAuthAlgorithms: ["RS256"]
      },
      createLocalJWKSet({ keys: [publicJwk] })
    );
    const token = await new SignJWT({ roles: [], scopes: [] })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("user-a")
      .setIssuer("https://auth.test")
      .setAudience("another-service")
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(verifier.verify(token)).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHORIZED"
    });
  });
});
