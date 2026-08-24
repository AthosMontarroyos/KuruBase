# Security Release Checklist

- [ ] Exposed tables have enabled and forced RLS.
- [ ] Runtime roles are not owners and cannot bypass RLS.
- [ ] Cross-user and cross-organization tests deny access.
- [ ] Mutations validate both existing and resulting rows.
- [ ] Access JWT signature, issuer, audience, lifetime, missing-header, service identity, and unmapped-principal failures are covered.
- [ ] Provider mode is explicit; production rejects `local-jwt`; OIDC dual-identity mismatch is denied.
- [ ] Roleless and insufficiently scoped principals are denied.
- [ ] Authorization-map changes use the offline administrator, produce audit entries, and cannot be made by the API role.
- [ ] SQL values are parameterized and identifiers are catalog-validated.
- [ ] Logs and errors contain no credentials or personal payloads.
- [ ] `.env` files are ignored and examples contain placeholders only.
- [ ] Type checks, tests, dependency audit, and Gitleaks pass.
