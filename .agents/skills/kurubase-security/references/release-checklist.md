# Security Release Checklist

- [ ] Exposed tables have enabled and forced RLS.
- [ ] Runtime roles are not owners and cannot bypass RLS.
- [ ] Cross-user and cross-organization tests deny access.
- [ ] Mutations validate both existing and resulting rows.
- [ ] JWT and Cloudflare failures are covered.
- [ ] SQL values are parameterized and identifiers are catalog-validated.
- [ ] Logs and errors contain no credentials or personal payloads.
- [ ] `.env` files are ignored and examples contain placeholders only.
- [ ] Type checks, tests, dependency audit, and Gitleaks pass.
