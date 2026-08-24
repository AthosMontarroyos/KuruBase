# ADR 0002: Private authorization map and RLS policy

- Status: Accepted
- Date: 2026-08-24

## Context

Cloudflare Access and a future KuruAuth deployment use different subject identifiers. Persisting either external value directly as an RLS owner would make provider cutover unsafe. Roles and scopes also require an authoritative server-side source that is independent of the provisional identity provider.

## Decision

KuruBase stores authorization data only in `kurubase_private`:

- A principal has an immutable UUID, optional organization, allowlisted roles and scopes, and active/disabled status.
- An external identity uniquely links provider, issuer, subject kind, and external subject to one principal. A principal may have multiple links so Access and OIDC can coexist during a controlled migration.
- An append-only audit table records offline administrative mutations.

The API runtime cannot mutate or enumerate these tables. It may only execute a narrowly scoped resolver function. Administrative changes use a separate offline CLI and database login. There is no remote bootstrap endpoint and no automatic account linking by email.

Recognized roles are `member`, `operator`, and `service`. Recognized scopes are:

- `kurubase:data:read`
- `kurubase:data:write`
- `kurubase:org:write`
- `kurubase:admin`

Roles do not imply scopes. Data reads require `kurubase:data:read`, mutations require `kurubase:data:write`, and administrative routes require `kurubase:admin`. A roleless principal may inspect its normalized identity through `/v1/me` but cannot use data or administrative routes, even if a scope was accidentally assigned.

The foundation `api.records` policy allows owners and organization members to read. Owners may write their rows. A principal in the same organization may write only with `org:write`. `owner_id` and `org_id` are immutable through the generic Data API; ownership transfer is outside the MVP.

## Consequences

- An Access subject and an OIDC subject can resolve to the same RLS owner without rewriting application rows.
- A valid external token without an active mapping is denied.
- Authorization changes are explicit, least-privileged, and auditable.
- PostgreSQL remains the final row-access decision point.
