variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the Zero Trust organization."
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone that owns the KuruBase hostname."
  type        = string
  sensitive   = true
}

variable "hostname" {
  description = "Public hostname protected by Access, for example database.example.com."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$", var.hostname))
    error_message = "hostname must be a lowercase DNS hostname."
  }
}

variable "dns_record_name" {
  description = "Record name relative to the Cloudflare zone, for example database."
  type        = string
  default     = "database"
}

variable "access_team_name" {
  description = "Cloudflare Zero Trust team name, without .cloudflareaccess.com."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.access_team_name))
    error_message = "access_team_name must contain only lowercase letters, digits, and hyphens."
  }
}

variable "allowed_identity_provider_ids" {
  description = "Identity provider IDs that interactive users may select."
  type        = list(string)
  default     = []
}

variable "allowed_interactive_emails" {
  description = "Exact interactive identities allowed by the MVP Access policy. Supply through an untracked tfvars file."
  type        = set(string)
  sensitive   = true

  validation {
    condition     = length(var.allowed_interactive_emails) > 0 && alltrue([for address in var.allowed_interactive_emails : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", address))])
    error_message = "At least one syntactically valid interactive email is required."
  }
}

variable "service_token_ids" {
  description = "Existing Access service-token IDs allowed to reach KuruBase. Secrets are managed outside Terraform configuration."
  type        = set(string)

  validation {
    condition     = length(var.service_token_ids) > 0
    error_message = "At least one Access service-token ID is required for server workloads."
  }
}

variable "kuruconsole_access_application_uid" {
  description = "Optional UID of the independently managed KuruConsole Access application allowed to forward user identity with a Linked App Token."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.kuruconsole_access_application_uid == null || length(trimspace(var.kuruconsole_access_application_uid)) > 0
    error_message = "kuruconsole_access_application_uid must be null or a non-empty Access application UID."
  }
}

variable "session_duration" {
  description = "Explicit Access application and policy session duration."
  type        = string
  default     = "8h"

  validation {
    condition     = can(regex("^[1-9][0-9]*(m|h)$", var.session_duration))
    error_message = "session_duration must use minutes or hours, for example 30m or 8h."
  }
}

variable "origin_service" {
  description = "Private origin reached by cloudflared."
  type        = string
  default     = "http://api:8080"

  validation {
    condition     = startswith(var.origin_service, "http://") || startswith(var.origin_service, "https://")
    error_message = "origin_service must be an HTTP or HTTPS URL."
  }
}
