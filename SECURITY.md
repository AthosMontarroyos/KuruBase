# Security Policy

## Reporting

Do not open a public issue for a suspected vulnerability. Contact the maintainers privately with the affected version, impact, reproduction steps, and any known mitigation.

Do not include live credentials or personal data in a report. Revoke any exposed credential immediately.

## Supported state

KuruBase is pre-1.0 software. Security fixes target the latest mainline release. Deployments must keep KuruAuth, Cloudflare Access, PostgreSQL, and KuruBase dependencies current.

## Invariants

- PostgreSQL is private and all exposed tables use enabled and forced RLS.
- KuruAuth is the only authentication authority.
- Administrative routes require KuruAuth authorization and Cloudflare Access when edge enforcement is enabled.
- Browser bundles contain no database, Cloudflare service-token, KuruAuth signing, or OpenAI credentials.
