# KuruBase Engineering Rules

## Product boundaries

- Write code, documentation, API messages, database identifiers, and UI copy in English.
- Build a self-hosted PostgreSQL database and Data API inspired by the Supabase database surface.
- Keep authentication in KuruAuth. KuruBase validates tokens but never owns accounts, passwords, sessions, or token issuance.
- Evolve public behavior from concrete KuruttinaBot requirements while preserving backwards compatibility.
- Keep Auth, Realtime, Storage, and Edge Functions outside the MVP.

## Cost-aware AWS runtime

- Production must be designed to hibernate automatically when there has been no qualifying application traffic for a configurable idle period; compute and database resources must not remain allocated indefinitely without a documented reason.
- Treat hibernation as an orchestration concern. Do not stop PostgreSQL from inside the API process, and do not rely on an idle connection timeout as a substitute for stopping or scaling infrastructure.
- The wake-up path must be external to the hibernated workload (for example, an AWS entry point, queue, scheduler, or load balancer integration) and must be documented before enabling scale-to-zero. A stopped container or EC2 instance cannot wake itself from an ordinary inbound request.
- Preserve PostgreSQL data on durable storage, use graceful shutdown, and verify recovery with health/readiness checks before routing traffic after wake-up.
- Keep local development and tests always-on by default. Production idle thresholds, wake-up behavior, minimum capacity, and the expected cold-start latency must be explicit configuration rather than hard-coded assumptions.
- Do not add background health checks, tunnel probes, metrics, or scheduled jobs that count as user traffic unless they are intentionally excluded from the hibernation decision.

## Mandatory security

- Use `$kurubase-security` for database, API, authentication, infrastructure, secrets, or personal-data changes.
- Enforce enabled and forced RLS on every exposed table.
- Keep runtime database roles non-owning and free of `BYPASSRLS`.
- Treat all client input as untrusted. Validate identifiers against the catalog and parameterize values.
- Never expose server credentials or privileged Cloudflare headers to browser code.
- Add denial tests for every authorization-sensitive feature.

## Implementation discipline

- Prefer existing workspace patterns and keep changes scoped.
- Follow DRY (Don't Repeat Yourself): keep business rules, security checks, validation, query construction, response contracts, and configuration in a single authoritative implementation whenever the same behavior would otherwise be maintained in multiple places.
- Search for an existing helper, type, constant, or module before adding another implementation of the same behavior.
- Refactor repeated behavior when doing so prevents drift or removes meaningful maintenance cost. Preserve public behavior and add or update tests before completing the refactor.
- Do not force unrelated concepts into a shared abstraction merely because their code looks similar. Prefer small local duplication over a premature abstraction with unclear ownership.
- Add SQL migrations for schema changes and keep them non-destructive by default.
- Pin dependencies and commit the npm lockfile.
- Run type checks, unit tests, integration tests when PostgreSQL behavior changes, and Gitleaks before release.
- Use `$impeccable` for frontend work and `$kurubase-browser-qa` after starting a web dev server.
