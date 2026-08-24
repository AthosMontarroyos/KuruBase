# ADR 0003: Independent KuruBase and KuruAuth repositories

- Status: Accepted
- Date: 2026-08-24

## Context

KuruBase and KuruAuth have different trust boundaries, persistence, secrets, and release lifecycles. A shared production Compose or source monorepo would make those boundaries easy to violate while providing little benefit to their HTTPS/OIDC integration.

## Decision

`KuruPlatform` is a thin Git superproject with pinned submodules for KuruBase and KuruAuth. It owns architecture documentation, the versioned identity compatibility contract, local bootstrap helpers, and black-box integration tests. It is not a runtime component.

KuruBase and KuruAuth each own their own:

- repository history and release;
- CI and Terraform state;
- database, volume, and database credentials;
- Cloudflare Tunnel, Access application, domain, and secrets.

KuruBase may consume only public KuruAuth OIDC discovery and JWKS endpoints over HTTPS. It never accesses the KuruAuth database or receives signing keys. If KuruAuth becomes the generic OIDC identity provider for Cloudflare Access, the OIDC endpoints required to complete login remain outside any Access policy that depends on KuruAuth.

## Consequences

- Compatible component SHAs are reproducible without combining product histories.
- Production deployments remain independently deployable and recoverable.
- Cross-product integration is a standards-based network contract rather than shared code or storage.
