resource "cloudflare_zero_trust_access_policy" "interactive" {
  account_id       = var.cloudflare_account_id
  name             = "KuruBase interactive users"
  decision         = "allow"
  session_duration = var.session_duration

  include = [
    for address in sort(tolist(var.allowed_interactive_emails)) : {
      email = {
        email = address
      }
    }
  ]
}

resource "cloudflare_zero_trust_access_policy" "service" {
  account_id       = var.cloudflare_account_id
  name             = "KuruBase server workloads"
  decision         = "non_identity"
  session_duration = var.session_duration

  include = [
    for token_id in sort(tolist(var.service_token_ids)) : {
      service_token = {
        token_id = token_id
      }
    }
  ]
}

resource "cloudflare_zero_trust_access_application" "kurubase" {
  account_id                = var.cloudflare_account_id
  name                      = "KuruBase"
  domain                    = var.hostname
  type                      = "self_hosted"
  session_duration          = var.session_duration
  app_launcher_visible      = false
  allowed_idps              = var.allowed_identity_provider_ids
  auto_redirect_to_identity = length(var.allowed_identity_provider_ids) == 1

  policies = [
    {
      id         = cloudflare_zero_trust_access_policy.interactive.id
      precedence = 1
    },
    {
      id         = cloudflare_zero_trust_access_policy.service.id
      precedence = 2
    }
  ]
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "kurubase" {
  account_id = var.cloudflare_account_id
  name       = "kurubase"
  config_src = "cloudflare"
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "kurubase" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.kurubase.id

  config = {
    ingress = [
      {
        hostname = var.hostname
        service  = var.origin_service
        origin_request = {
          access = {
            required  = true
            team_name = var.access_team_name
            aud_tag   = [cloudflare_zero_trust_access_application.kurubase.aud]
          }
        }
      },
      {
        service = "http_status:404"
      }
    ]
  }
}

resource "cloudflare_dns_record" "kurubase" {
  zone_id = var.cloudflare_zone_id
  name    = var.dns_record_name
  content = "${cloudflare_zero_trust_tunnel_cloudflared.kurubase.id}.cfargotunnel.com"
  type    = "CNAME"
  ttl     = 1
  proxied = true
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "kurubase" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.kurubase.id
}
