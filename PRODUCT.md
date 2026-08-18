# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing TypeScript monorepo with a Fastify REST API, PostgreSQL, Docker Compose, Cloudflare Tunnel/Access, KuruAuth token verification, and a Supabase-style TypeScript client package.

## Users

The primary user is the project owner and open-source maintainer, using KuruBase across personal software projects. Future users include maintainers and operators of those projects who need to inspect and manage the database through the administrative web interface.

## Product Purpose

KuruBase is a self-hosted PostgreSQL Data API and administrative web interface for personal projects and related services such as KuruttinaBot. It provides a familiar Supabase-style data access surface while keeping authentication in KuruAuth. Success means the owner can reuse one secure database and administration surface across projects without adopting a hosted database platform.

## Positioning

KuruBase combines a self-hosted PostgreSQL Data API, forced row-level security, external KuruAuth authentication, and a single Cloudflare-Tunnel-accessible administrative site. Its security boundary and deployment model remain under the owner’s control while preserving a familiar TypeScript query-client experience.

## Operating Context

KuruBase is self-hosted and used across the owner’s personal projects. Services access the API with KuruAuth bearer tokens through the TypeScript client. The owner and authorized operators use one web administration interface, unified behind Cloudflare Tunnel and Access, to work with the database and operational status. Production PostgreSQL remains private and is not exposed through a host port.

## Capabilities and Constraints

- PostgreSQL tables exposed through a catalog-validated REST Data API.
- CRUD operations with filters, ordering, limits, offsets, and exact counts.
- Enabled and forced row-level security on every exposed table.
- Fastify API with KuruAuth JWT/OIDC verification and scope-based administrative authorization.
- TypeScript client exported from `supabase.ts`, with no `.auth` namespace.
- Health endpoints for liveness and readiness.
- Docker Compose deployment with Cloudflare Tunnel and Access.
- AWS cost-aware production runtime with configurable idle hibernation, durable PostgreSQL storage, and an external wake-up path.
- KuruAuth owns accounts, passwords, sessions, and token issuance; KuruBase only validates tokens and authorizes requests.
- Auth, Realtime, Storage, and Edge Functions are outside the MVP.
- The administrative web interface and its browser-facing security model are planned product scope.
- Open decision: define the administrative interface’s supported roles and target accessibility standard before implementation.

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
- Cloudflare Tunnel configuration example: `infra/cloudflare/config.example.yml`.
- No administrative web interface exists in the current repository yet; future work must not fabricate operational data, users, testimonials, or performance claims.

## Product Principles

- Keep the owner in control through self-hosted infrastructure.
- Make secure defaults part of the product surface, not an operator afterthought.
- Preserve a familiar developer experience for services integrating with the Data API.
- Centralize administration so personal projects can share one operational home.
- Evolve from concrete personal-project needs while maintaining backwards compatibility.
