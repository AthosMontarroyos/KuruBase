# ADR 0001: Neutral identity contract

- Status: Accepted
- Date: 2026-08-24

## Context

KuruBase already keeps its PostgreSQL data plane separate from KuruAuth, but the API bootstrap, environment contract, and TypeScript client require KuruAuth-specific bearer tokens. PostgreSQL itself only consumes a normalized JSON identity through transaction-local `request.jwt.claims`.

Cloudflare Access is mandatory at the production edge and already sends a signed application token to the origin. The MVP must operate before KuruAuth exists without turning KuruBase into an account, password, session, or token-issuing service.

## Decision

KuruBase authenticates requests through a single explicit `IdentityProvider` mode and produces this canonical value:

```ts
interface RlsIdentity {
  sub: string;
  org_id: string | null;
  roles: string[];
  scopes: string[];
}
```

Supported modes are:

- `cloudflare-access`: production MVP. The validated Access application token is both the edge credential and the external identity.
- `oidc`: optional compatibility and future KuruAuth integration. Production still requires Access, and both identities must resolve to the same canonical principal.
- `local-jwt`: signed development/test identity carrying synthetic canonical claims directly. It never participates in the external authorization map and is rejected in production.

The mode is fail-closed. KuruBase never accepts multiple identity providers as alternatives in one request, never derives identity from unsigned headers, and never auto-provisions an external subject.

`request.jwt.claims` remains the database interface. `AuthClaims` remains a temporary source-compatible alias for `RlsIdentity`.

## Consequences

- Cloudflare Access can provide MVP identity without KuruAuth.
- The existing bearer verifier remains available through the neutral OIDC mode.
- KuruBase continues to own authorization and RLS, not authentication accounts or token issuance.
- Changing providers does not change row ownership because external subjects are linked to a local canonical `sub`.
