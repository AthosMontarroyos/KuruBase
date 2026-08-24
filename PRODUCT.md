# Product

<!-- impeccable:product-schema 1 -->

## Platform

server

## Stack

TypeScript Fastify REST API, PostgreSQL, Docker Compose, Cloudflare Tunnel/Access, a provider-neutral identity contract, and a Supabase-style TypeScript client package.

## Users

The primary users are maintainers and trusted server workloads integrating personal projects such as KuruttinaBot with a reusable self-hosted database API. Browser administration is provided by the independently deployed KuruConsole.

## Product purpose

KuruBase provides a self-hosted PostgreSQL Data API with forced row-level security and external identity verification. Success means projects can share a secure database surface without adopting a hosted database platform or coupling accounts, browser UI, and data authorization into one runtime.

## Capabilities and constraints

- Catalog-validated CRUD, filters, ordering, limits, offsets, and exact counts.
- Enabled and forced RLS on every exposed table.
- Provider-neutral `RlsIdentity { sub, org_id, roles, scopes }`.
- Cloudflare Access JWT verification plus a private, auditable authorization map.
- Optional generic OIDC verification for a future independent KuruAuth.
- TypeScript client exported from `supabase.ts`, with no `.auth` namespace.
- Health endpoints and a Compose deployment containing only PostgreSQL, API, and Tunnel.
- No HTML, frontend source, account, password, session, or token issuance capability.
- Independent KuruConsole integration through Cloudflare Linked App Tokens; no CORS or unsigned identity forwarding.
- AWS idle hibernation remains a separate infrastructure workstream until a durable database topology and external wake path are selected.
- Auth, Realtime, Storage, and Edge Functions remain outside the MVP.

## Repository boundaries

- KuruBase owns PostgreSQL, API, authorization mapping, RLS, API infrastructure, and its release.
- KuruConsole owns the browser application, same-origin proxy, Console infrastructure, and its release.
- KuruAuth will own accounts and OIDC when introduced.
- KuruPlatform pins compatible commits but never participates in production traffic.

## Product principles

- Keep secure defaults and denial behavior testable.
- Keep runtime roles non-owning and subject to RLS.
- Preserve a familiar client surface and backwards-compatible API behavior.
- Integrate across products through signed HTTPS standards rather than shared code, storage, state, or secrets.
