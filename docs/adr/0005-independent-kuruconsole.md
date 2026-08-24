# ADR 0005: Independent KuruConsole repository and linked identity forwarding

- Status: Accepted
- Date: 2026-08-24

## Context

Serving the administrative interface from the Fastify Data API coupled frontend builds, releases, browser headers, and the API container. Separate public hostnames would normally add a browser CORS and Access-cookie boundary.

## Decision

The administrative interface moves to the independent `KuruConsole` repository. It owns its source, image, CI, domain, Tunnel, Access application, Terraform state, and deployment credentials. KuruBase serves no HTML or frontend assets.

The browser calls `/v1/*` on the KuruConsole origin. After validating the Console application JWT, the Console proxy forwards it as `Cf-Access-Token` to the KuruBase hostname. A KuruBase Linked App Token policy validates that the token was issued for the configured KuruConsole application and emits a new `Cf-Access-Jwt-Assertion` scoped to KuruBase. The existing KuruBase verifier then resolves the user through the private authorization map and RLS.

KuruConsole never forwards browser cookies, Bearer tokens, service-token headers, or unsigned identity claims. It owns no database or authorization data.

## Consequences

- Frontend and API releases are independent without introducing browser CORS.
- No extra service-token secret is required for interactive user propagation.
- The only deployment contract is the Console application UID configured in the KuruBase Access policy and the public API origin configured in KuruConsole.
- KuruPlatform pins compatible commits but remains absent from runtime traffic.
