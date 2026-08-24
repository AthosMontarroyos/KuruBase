# Security Policy

## Reporting

Do not open a public issue for a suspected vulnerability. Contact the maintainers privately with the affected version, impact, reproduction steps, and any known mitigation.

Do not include live credentials or personal data in a report. Revoke any exposed credential immediately.

## Supported state

KuruBase is pre-1.0 software. Security fixes target the latest mainline release. Deployments must keep Cloudflare Access, PostgreSQL, KuruBase dependencies, and any configured OIDC provider current.

## Invariants

- PostgreSQL is private and all exposed tables use enabled and forced RLS.
- KuruBase never owns accounts, passwords, sessions, or token issuance. It accepts identity only through the explicitly configured provider.
- Production ingress requires a validated Cloudflare Access login or scoped service token; only local development and tests may disable Access.
- In `cloudflare-access` mode, the origin validates the signed Access application JWT and resolves its external subject through the private authorization map. Unsigned identity headers and unmapped or disabled principals are denied.
- In production `oidc` mode, the Access and OIDC credentials must both validate and resolve to the same canonical principal. KuruBase consumes only public discovery/JWKS material and never receives signing keys.
- For Access and OIDC, roles and scopes come only from the server-side authorization map; forced RLS remains the final row-access decision. Administrative routes require `kurubase:admin`.
- `local-jwt` is restricted to development and tests, carries synthetic canonical claims directly, and is rejected in production.
- Browser bundles contain no database, Cloudflare service-token, KuruAuth signing, or OpenAI credentials.
