---
name: kurubase-security
description: Enforce KuruBase security architecture. Use for every database schema, migration, RLS policy, Fastify route, KuruAuth integration, Cloudflare configuration, secret, audit log, data export, dependency change, or security review in this repository.
---

# KuruBase Security

Treat security as a release requirement. Reject a change when its authorization behavior cannot be demonstrated by tests.

## Workflow

1. Identify the trust boundary, protected data, caller identity, and mutation scope.
2. Read [references/database.md](references/database.md) for schema, query, migration, or RLS work.
3. Read [references/auth-edge.md](references/auth-edge.md) for JWT, API, Cloudflare, or browser-facing work.
4. Implement least privilege and deny-by-default behavior.
5. Add a positive test and at least one cross-tenant or unauthorized test.
6. Run [references/release-checklist.md](references/release-checklist.md) before completing security-sensitive work.

## Non-negotiable rules

- Never expose PostgreSQL credentials, Cloudflare service tokens, KuruAuth signing material, or OpenAI keys to browser code.
- Never derive identity or authorization from request body, query, path, or unsigned headers.
- Never grant table ownership, superuser, or `BYPASSRLS` to the API runtime role.
- Require `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on every exposed table.
- Require explicit `USING` and `WITH CHECK` predicates for mutations.
- Reject dynamic identifiers unless catalog-validated and safely quoted. Parameterize every data value.
- Keep privileged functions in a private schema, set an empty `search_path`, revoke `PUBLIC` execute, and document why privilege elevation is required.
- Keep logs structured and sanitized. Never log bearer tokens, cookies, connection strings, request bodies, or raw personal identifiers.
- Keep migrations reviewable and non-destructive by default. Require an explicit data migration and rollback strategy for destructive work.
- Pin dependency versions, commit lockfiles, and run secret and dependency scans.

KuruBase does not implement accounts, passwords, sessions, or token issuance. It authenticates through the explicit provider mode, resolves external subjects to canonical local principals, and performs authorization through the private map plus forced RLS. Cloudflare Access is the MVP provider; KuruAuth may be added later only through the generic OIDC boundary.
