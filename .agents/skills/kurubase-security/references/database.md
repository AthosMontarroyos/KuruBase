# Database Security

## Roles and schemas

- Use a migration owner separate from the runtime role.
- Revoke default `PUBLIC` access from application schemas.
- Expose only allowlisted schemas; use `api` by default and keep helpers in `kurubase_private`.
- Grant the runtime role only schema usage and required table operations.

## RLS

- Enable and force RLS on every table in an exposed schema.
- Make the API catalog refuse tables where `relrowsecurity` or `relforcerowsecurity` is false.
- Read identity from transaction-local `request.jwt.claims` only.
- Index owner and organization columns referenced by policies.
- For `UPDATE`, require a matching `SELECT` policy plus `USING` and `WITH CHECK`.
- Create exposed views with `security_invoker = true` on PostgreSQL 15 or newer.

## Queries and migrations

- Validate schemas, tables, columns, operators, sort directions, and mutation fields against PostgreSQL catalog metadata.
- Quote validated identifiers and bind all values as parameters.
- Reject unfiltered update and delete requests.
- Keep request transactions short and set a local statement timeout.
- Do not add `DROP`, `TRUNCATE`, or destructive type conversions without explicit approval and a tested data migration.
