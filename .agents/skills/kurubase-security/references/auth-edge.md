# Authentication and Edge Security

## Identity providers

- Require an explicit provider mode and fail startup when its complete configuration is absent or conflicting.
- Verify signature, issuer, audience, expiry, and an explicit algorithm allowlist for every JWT.
- Convert verified Access and OIDC subjects into `RlsIdentity { sub, org_id, roles, scopes }` only through the private authorization map.
- Reject unmapped, disabled, or malformed principals during authentication. Permit a roleless principal only to inspect `/v1/me`; deny it on every data or administrative route even if a scope was accidentally assigned. Never auto-link by email.
- Reject `alg=none`, unknown algorithms, stale tokens, malformed claims, and missing bearer tokens.
- Cache remote JWKS through a maintained JOSE implementation and handle key rotation without disabling verification.
- Permit synthetic canonical claims in `local-jwt` only in development and tests. Production OIDC mode requires the Access and OIDC identities to resolve to the same canonical principal.

## Cloudflare

- Keep PostgreSQL on a private container network with no production host port.
- Route API traffic through Cloudflare Tunnel and Access.
- Validate `Cf-Access-Jwt-Assertion` cryptographically at the origin; do not trust Access identity headers on a directly reachable origin.
- In `cloudflare-access` mode, use the verified Access `sub` for humans and signed service-token identity claim for non-interactive callers only as an external lookup key.
- Require `kurubase:admin` for `/v1/admin/**`; roles never imply scopes.
- Keep service-token credentials server-side only.

## Future KuruAuth

- Keep its database, signing keys, secrets, CI, Tunnel, domain, and deployment independent from KuruBase.
- Consume only public OIDC discovery/JWKS over HTTPS. Never access the KuruAuth database or receive private signing material.
- Keep discovery, authorization, token, and JWKS endpoints outside any Access policy that depends on KuruAuth as its identity provider.

## HTTP

- Validate every body, path, and supported query option server-side.
- Return stable error codes without stack traces or internal SQL details.
- Apply bounded body sizes, request timeouts, and rate limits.
- Configure CORS explicitly when a browser frontend is introduced; never use credentialed wildcard origins.
