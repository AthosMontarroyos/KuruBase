# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing TypeScript monorepo with a Fastify REST API and dashboard, PostgreSQL, Docker Compose, Cloudflare Tunnel/Access, a neutral identity-provider contract, and a Supabase-style TypeScript client package.

## Users

The primary user is the project owner and open-source maintainer, using KuruBase across personal software projects. Future users include maintainers and operators of those projects who need to inspect and manage the database through the administrative web interface.

## Product Purpose

KuruBase is a self-hosted PostgreSQL Data API and administrative web interface for personal projects and related services such as KuruttinaBot. It provides a familiar Supabase-style data access surface while keeping user accounts and token issuance outside the product. Success means the owner can reuse one secure database and administration surface across projects without adopting a hosted database platform.

## Positioning

KuruBase combines a self-hosted PostgreSQL Data API, forced row-level security, external identity verification, and a single Cloudflare-Tunnel-accessible administrative site. Cloudflare Access is the MVP identity provider; independently deployed OIDC providers such as KuruAuth can be added without changing the database identity contract.

## Operating Context

KuruBase is self-hosted and used across the owner’s personal projects. Browser requests use their same-origin Cloudflare Access session, and services use scoped Access service tokens through the TypeScript client. The owner and authorized operators use one web administration interface behind the same Tunnel and Access application as the API. Production PostgreSQL remains private and is not exposed through a host port.

## Capabilities and Constraints

- PostgreSQL tables exposed through a catalog-validated REST Data API.
- CRUD operations with filters, ordering, limits, offsets, and exact counts.
- Enabled and forced row-level security on every exposed table.
- Fastify API and same-origin dashboard with a provider-neutral `RlsIdentity` contract.
- Cloudflare Access JWT verification at the origin, plus a private, auditable principal-to-organization/role/scope map.
- Optional generic OIDC verification for a future independent KuruAuth deployment; production cutover requires identity equivalence with Access.
- TypeScript client exported from `supabase.ts`, with no `.auth` namespace.
- Health endpoints for liveness and readiness.
- Docker Compose deployment with Cloudflare Tunnel and Access.
- AWS idle hibernation remains a required, separate infrastructure workstream; it is not enabled until a durable PostgreSQL topology and external wake-up path are selected and verified.
- KuruBase never owns accounts, passwords, sessions, or token issuance. A future KuruAuth deployment owns those concerns independently.
- Auth, Realtime, Storage, and Edge Functions are outside the MVP.
- The dashboard reads live identity and administrative status from the API and treats authentication/authorization failures as explicit states.
- Roles are `member`, `operator`, and `service`; scopes are explicit and do not follow automatically from roles.

## Brand Commitments

- Product name: KuruBase.
- Authentication service name: KuruAuth.
- The project is open source under AGPL-3.0-only.
- KuruttinaBot is an existing related service and a concrete compatibility requirement.

## Evidence on Hand

- Product and deployment overview: `README.md`.
- REST API implementation: `apps/api/src/`.
- TypeScript client implementation and tests: `packages/client/src/` and `packages/client/test/`.
- PostgreSQL foundation, runtime roles, RLS, and migrations: `infra/postgres/`.
- Cloudflare Access/Tunnel Terraform: `infra/cloudflare/terraform/`.
- Administrative web interface: `apps/dashboard/`, served by the Fastify origin without fabricated operational data.
- Architecture decisions: `docs/adr/` and `docs/architecture/identity-topology.mmd`.

## Product Principles

- Keep the owner in control through self-hosted infrastructure.
- Make secure defaults part of the product surface, not an operator afterthought.
- Preserve a familiar developer experience for services integrating with the Data API.
- Centralize administration so personal projects can share one operational home.
- Evolve from concrete personal-project needs while maintaining backwards compatibility.
