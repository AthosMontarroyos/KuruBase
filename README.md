# KuruBase

KuruBase is an AGPL-3.0 self-hosted PostgreSQL Data API for KuruttinaBot and related services. It provides a familiar Supabase-style TypeScript query client while keeping authentication in KuruAuth.

## MVP

- PostgreSQL with enabled and forced row-level security
- Fastify REST API with KuruAuth JWT/OIDC verification
- Catalog-validated CRUD, filters, ordering, limits, offsets, and exact counts
- TypeScript client exported from `supabase.ts`
- Docker Compose deployment behind Cloudflare Tunnel and Access

Auth, Realtime, Storage, and Edge Functions are intentionally outside the MVP.

## Local development

1. Configure `.env` using `.env.example` as a reference and replace every placeholder.
2. Install pinned dependencies with `npm install`.
3. Start PostgreSQL with `docker compose -f compose.yaml -f compose.dev.yaml up -d postgres`.
4. Run integration tests with `TEST_DATABASE_URL=postgresql://kurubase_api:<password>@127.0.0.1:5432/kurubase npm run test:integration`.
5. Start the API with `npm run dev`.

The API requires a valid KuruAuth bearer token. Cloudflare Access can be disabled only for local development and tests.
Set `POSTGRES_PORT` or `API_PORT` when the default local ports are already in use.

## Data API

The REST surface is:

- `GET /v1/data/:table`
- `POST /v1/data/:table`
- `PATCH /v1/data/:table`
- `DELETE /v1/data/:table`
- `GET /health/live`
- `GET /health/ready`

Only tables in the configured exposed schema are considered. A table is rejected unless PostgreSQL reports both RLS and forced RLS.

## Client

```ts
import { createClient } from "@kurubase/client";

const kurubase = createClient("https://database.example.com", {
  accessToken: () => kuruAuth.getAccessToken()
});

const result = await kurubase
  .from("records")
  .select("id,data,created_at")
  .eq("owner_id", userId)
  .order("created_at", { ascending: false })
  .limit(20);
```

The client deliberately has no `.auth` namespace.

## Local production

Production uses a separate environment file and requires real KuruAuth and Cloudflare Access values. The validator rejects placeholders, weak passwords, shared database passwords, non-HTTPS KuruAuth URLs, and disabled Cloudflare Access.

1. Configure `.env.production` using `.env.production.example` as a reference.
2. Run `npm run production:env`.
3. Run `npm run production:config`.
4. Start the complete stack with `npm run production:start`.
5. Check `http://127.0.0.1:8080/health/live` and `http://127.0.0.1:8080/health/ready`.
6. Inspect logs with `npm run production:logs`.
7. Stop services with `npm run production:down`.

PostgreSQL has no host port in production. The API is exposed only on loopback for local operational checks; external traffic must use the Cloudflare Tunnel and Access.
