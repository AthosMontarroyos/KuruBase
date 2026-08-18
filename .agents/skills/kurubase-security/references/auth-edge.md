# Authentication and Edge Security

## KuruAuth

- Verify signature, issuer, audience, expiry, and an explicit algorithm allowlist.
- Require `sub`; validate `org_id`, `roles`, and `scopes` before use.
- Reject `alg=none`, unknown algorithms, stale tokens, malformed claims, and missing bearer tokens.
- Cache remote JWKS through a maintained JOSE implementation and handle key rotation without disabling verification.

## Cloudflare

- Keep PostgreSQL on a private container network with no production host port.
- Route API traffic through Cloudflare Tunnel and Access.
- Validate the Access JWT when edge enforcement is enabled; do not trust Access headers on a directly reachable origin.
- Require both Cloudflare Access and a KuruAuth administrative scope for `/v1/admin/**`.
- Keep service-token credentials server-side only.

## HTTP

- Validate every body, path, and supported query option server-side.
- Return stable error codes without stack traces or internal SQL details.
- Apply bounded body sizes, request timeouts, and rate limits.
- Configure CORS explicitly when a browser frontend is introduced; never use credentialed wildcard origins.
