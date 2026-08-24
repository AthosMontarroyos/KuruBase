output "access_audience" {
  description = "Configure this value as CLOUDFLARE_ACCESS_AUDIENCE in KuruBase."
  value       = cloudflare_zero_trust_access_application.kurubase.aud
}

output "access_team_domain" {
  description = "Configure this value as CLOUDFLARE_ACCESS_TEAM_DOMAIN in KuruBase."
  value       = "${var.access_team_name}.cloudflareaccess.com"
}

output "hostname" {
  value = var.hostname
}

output "tunnel_token" {
  description = "Store as CLOUDFLARE_TUNNEL_TOKEN in the KuruBase production secret store."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.kurubase.token
  sensitive   = true
}
