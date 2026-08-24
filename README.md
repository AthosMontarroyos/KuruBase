# KuruBase

KuruBase is an AGPL-3.0 self-hosted PostgreSQL Data API for KuruttinaBot and related services. It provides a familiar Supabase-style TypeScript query client while keeping accounts, passwords, sessions, token issuance, and browser UI outside the product.

## MVP

- PostgreSQL with enabled and forced row-level security
- Fastify REST Data API
- Provider-neutral `RlsIdentity { sub, org_id, roles, scopes }`
- Cloudflare Access JWT validation at the origin
- Private, auditable external-identity-to-principal authorization map
- Catalog-validated CRUD, filters, ordering, limits, offsets, and exact counts
- TypeScript client exported from `supabase.ts`
- Docker Compose deployment behind an independently managed Cloudflare Tunnel and Access application

Auth accounts, Realtime, Storage, and Edge Functions are intentionally outside the MVP.

## Identity and authorization

`IDENTITY_PROVIDER` is required and fail-closed:

| Mode | Intended use | Request credentials |
| --- | --- | --- |
| `cloudflare-access` | Production MVP | Validated `Cf-Access-Jwt-Assertion` inserted by Access |
| `oidc` | Future KuruAuth or compatible OIDC provider | Validated Access assertion and Bearer JWT resolving to the same canonical principal in production |
| `local-jwt` | Development and tests only | HS256 Bearer JWT; rejected when `NODE_ENV=production` |

Cloudflare and OIDC subjects are lookup keys, not row owners. The private PostgreSQL map links `(provider, issuer, kind, subject)` to an immutable local UUID and its organization, roles, and scopes. Unmapped or disabled principals are denied, and the API runtime cannot mutate or enumerate the map. No identity is linked automatically by email.

Recognized roles are `member`, `operator`, and `service`. Roles do not imply scopes. Reads require `kurubase:data:read`, mutations require `kurubase:data:write`, same-organization writes additionally require `kurubase:org:write`, and `/v1/admin/**` requires `kurubase:admin`. A roleless principal cannot use data or administrative routes.

The API writes the normalized principal to transaction-local `request.jwt.claims`; PostgreSQL RLS remains the final row-access decision.

## Local development

1. Copy `.env.example` to the ignored `.env` file and replace every placeholder. Use three different database passwords.
2. Install the pinned dependencies with `npm install`.
3. Start a fresh development PostgreSQL with `docker compose -f compose.yaml -f compose.dev.yaml up -d postgres`.
4. Run integration tests with `TEST_DATABASE_URL=postgresql://kurubase_api:<password>@127.0.0.1:5432/kurubase npm run test:integration`.
5. Start the API with `npm run dev`; its health endpoint is `http://127.0.0.1:8080/health/live`.

The local example uses `local-jwt`; API requests therefore need a correctly signed development Bearer token. Run the independent KuruConsole repository when a browser administration surface is needed. Set `POSTGRES_PORT` or `API_PORT` when the defaults are already in use.

The PostgreSQL entrypoint applies migrations only when initializing a new volume. Before switching identity modes on an existing production deployment, take a backup, enter a maintenance window, validate the new `.env.production`, and recreate only the PostgreSQL container so it receives the new identity-administrator secret while retaining its named data volume:

```sh
npm run production:env
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml up -d --no-deps --force-recreate --wait postgres
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1' < infra/postgres/migrations/0002_identity_authorization.sql
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1' < infra/postgres/init/002_runtime_role.sql
```

The first streamed SQL file creates the private authorization map and its `NOLOGIN` roles; the second obtains both database passwords from the recreated PostgreSQL container environment and enables the API and identity-administration logins without embedding credentials in migration files or command arguments. Streaming the reviewed repository files avoids relying on init-only mounts for an existing volume.

## Authorization-map administration

Authorization changes use a dedicated non-owner, non-`BYPASSRLS` database login and an offline CLI. There is no HTTP bootstrap endpoint.

```sh
export KURUBASE_IDENTITY_ADMIN_DATABASE_URL='postgresql://kurubase_identity_admin:<admin-password>@127.0.0.1:5432/kurubase'

npm run identity:admin -- create-principal \
  --actor operator-bootstrap \
  --org example-org \
  --role member \
  --scope kurubase:data:read

export KURUBASE_IDENTITY_EXTERNAL_SUBJECT='<verified-external-subject>'
npm run identity:admin -- link-identity \
  --actor operator-bootstrap \
  --principal '<principal-uuid>' \
  --provider cloudflare-access \
  --issuer https://your-team.cloudflareaccess.com \
  --kind human
unset KURUBASE_IDENTITY_EXTERNAL_SUBJECT
```

Obtain the Access subject from a signed token using trusted Cloudflare tooling and inspect it locally; do not paste assertions into third-party token viewers. Human mappings use the signed `sub`. Access service-token mappings use `kind=service` and the token's signed `common_name` value. The subject is accepted only through `KURUBASE_IDENTITY_EXTERNAL_SUBJECT` so it does not appear in shell history or process arguments.

Use `npm run identity:admin -- --help` for grant, revoke, disable, inspection, and audit commands. Keep the administrator URL out of API environments and browser code.

## Data API

The REST surface is:

- `GET /v1/me`
- `GET /v1/data/:table`
- `POST /v1/data/:table`
- `PATCH /v1/data/:table`
- `DELETE /v1/data/:table`
- `GET /v1/admin/status`
- `GET /health/live`
- `GET /health/ready`

Only tables in the configured exposed schema are considered. A table is rejected unless PostgreSQL reports both RLS and forced RLS. `owner_id` and `org_id` are immutable through the generic Data API.

## Client

Browser code should call the independent KuruConsole same-origin proxy rather than the KuruBase hostname directly:

```ts
import { createClient } from "@kurubase/client";

const kurubase = createClient(window.location.origin);
const result = await kurubase
  .from("records")
  .select("id,data,created_at")
  .order("created_at", { ascending: false })
  .limit(20);
```

A trusted server workload supplies its Access service-token headers. Never include these values in a browser bundle:

```ts
const kurubase = createClient("https://database.example.com", {
  headers: {
    "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID!,
    "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET!
  }
});
```

OIDC deployments additionally set `accessToken` to a Bearer-token provider. The client deliberately has no `.auth` namespace.

KuruConsole validates its own Access assertion and forwards it through Cloudflare's `Cf-Access-Token` Linked App Token flow. KuruBase does not accept a browser cookie, service secret, or custom unsigned identity header from the Console.

## Production and Cloudflare

Production uses `.env.production.example`, requires `IDENTITY_PROVIDER=cloudflare-access` or `oidc`, and always requires Cloudflare Access. The validator rejects placeholders, weak or shared database passwords, a local identity provider, non-HTTPS OIDC endpoints, and an origin database outside the private Compose service.

1. Provision the dedicated API Access application, policies, Tunnel, and DNS record from `infra/cloudflare/terraform/`. If KuruConsole is deployed, supply its independently produced Access application UID to enable the Linked App Token policy.
2. Store the sensitive Terraform outputs in the production secret store; do not commit a populated tfvars file or Terraform state.
3. Configure `.env.production` and run `npm run production:env`.
4. Run `npm run production:config`, then `npm run production:start`.
5. Inspect `npm run production:logs`; stop with `npm run production:down`.

PostgreSQL has no production host port. External traffic reaches the API only through its Tunnel and deny-by-default Access policy. Infrastructure hibernation is deliberately not enabled by this change; the external wake path and durable PostgreSQL runtime require the separate decision in `docs/adr/0004-aws-hibernation-workstream.md`.

## Repository architecture

KuruBase, KuruConsole, and KuruAuth remain independent products. KuruBase contains no frontend source or static build. The sibling `KuruPlatform` superproject pins compatible commits and contains architecture images and black-box contracts, but it is not a runtime and owns no shared database, volume, secret, Tunnel, or deployment.

The accepted decisions are in `docs/adr/`, and the machine-readable topology source is `docs/architecture/identity-topology.mmd`. A future KuruAuth integration uses only public OIDC discovery/JWKS over HTTPS; KuruBase never accesses its database or receives a signing key.
