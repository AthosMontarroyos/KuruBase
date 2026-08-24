# KuruBase Cloudflare infrastructure

This Terraform root owns only the KuruBase Cloudflare boundary: its remotely managed Tunnel, DNS record, Access application, and deny-by-default interactive and service policies. KuruAuth must use a separate Terraform state, Tunnel, hostname, policies, and credentials.

## Security model

- Interactive identities are allowlisted by exact email at the Access edge. KuruBase does not use email as an application principal; the signed Access `sub` is resolved through the private authorization map.
- Server workloads use existing scoped Access service tokens. Their client secrets must be stored in the calling workload's secret store and never in this repository or a browser bundle.
- `cloudflared` validates the application audience before proxying. The Fastify origin validates `Cf-Access-Jwt-Assertion` again and performs local authorization and PostgreSQL RLS.
- The Terraform state contains sensitive tunnel material. Use an encrypted, access-controlled remote backend and never commit local state.

## Usage

1. Copy `terraform.tfvars.example` to an untracked file outside the repository or supply variables through your CI secret mechanism.
2. Export a scoped `CLOUDFLARE_API_TOKEN` with only DNS, Tunnel, and Access application/policy permissions for this account and zone.
3. Configure an encrypted remote backend before the first apply.
4. Run `terraform init`, `terraform fmt -check`, `terraform validate`, and `terraform plan`.
5. Review the Access application audience before apply. Replacing an Access application changes its audience and requires updating `CLOUDFLARE_ACCESS_AUDIENCE` atomically.
6. Apply only through the KuruBase infrastructure workflow, then store the sensitive `tunnel_token` output in the KuruBase production secret store.

Service-token creation and rotation are deliberately separate from this root so their client secrets do not become outputs consumed by browser-facing or coordination repositories.
