const value = (name) => process.env[name] ?? "";
const effectiveAlias = (primary, legacy) => value(primary) || value(legacy);
const oidcAliases = [
  ["OIDC_ISSUER", "KURUAUTH_ISSUER"],
  ["OIDC_AUDIENCE", "KURUAUTH_AUDIENCE"],
  ["OIDC_JWKS_URL", "KURUAUTH_JWKS_URL"]
];
const required = [
  "NODE_ENV", "DATABASE_URL", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD",
  "KURUBASE_API_PASSWORD", "KURUBASE_IDENTITY_ADMIN_PASSWORD", "IDENTITY_PROVIDER",
  "CLOUDFLARE_ACCESS_TEAM_DOMAIN",
  "CLOUDFLARE_ACCESS_AUDIENCE", "CLOUDFLARE_TUNNEL_TOKEN"
];

const placeholder = /replace_with|your[-_.]|example\.(?:com|test)|changeme|change-me/i;
const missing = required.filter((name) => !value(name));
const invalid = required.filter((name) => value(name) && placeholder.test(value(name)));
const errors = [];

if (missing.length > 0) errors.push("Missing variables: " + missing.join(", "));
if (invalid.length > 0) errors.push("Placeholder variables: " + invalid.join(", "));
if (value("NODE_ENV") !== "production") errors.push("NODE_ENV must be production");
if (!["cloudflare-access", "oidc"].includes(value("IDENTITY_PROVIDER"))) errors.push("IDENTITY_PROVIDER must be cloudflare-access or oidc in production");
if (value("CLOUDFLARE_ACCESS_REQUIRED") && value("CLOUDFLARE_ACCESS_REQUIRED") !== "true") errors.push("CLOUDFLARE_ACCESS_REQUIRED cannot be false in production");
if (value("POSTGRES_USER") === "postgres") errors.push("POSTGRES_USER must be a dedicated owner role, not postgres");
if (value("POSTGRES_PASSWORD").length < 32) errors.push("POSTGRES_PASSWORD must contain at least 32 characters");
if (value("KURUBASE_API_PASSWORD").length < 32) errors.push("KURUBASE_API_PASSWORD must contain at least 32 characters");
if (value("KURUBASE_IDENTITY_ADMIN_PASSWORD").length < 32) errors.push("KURUBASE_IDENTITY_ADMIN_PASSWORD must contain at least 32 characters");
if (value("POSTGRES_PASSWORD") === value("KURUBASE_API_PASSWORD")) errors.push("POSTGRES_PASSWORD and KURUBASE_API_PASSWORD must be different");
if (value("KURUBASE_IDENTITY_ADMIN_PASSWORD") && [value("POSTGRES_PASSWORD"), value("KURUBASE_API_PASSWORD")].includes(value("KURUBASE_IDENTITY_ADMIN_PASSWORD"))) errors.push("KURUBASE_IDENTITY_ADMIN_PASSWORD must differ from both runtime database passwords");

if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/i.test(value("CLOUDFLARE_ACCESS_TEAM_DOMAIN"))) {
  errors.push("CLOUDFLARE_ACCESS_TEAM_DOMAIN must be a Cloudflare Access team hostname");
}

try {
  const databaseUrl = new URL(value("DATABASE_URL"));
  if (databaseUrl.protocol !== "postgresql:") errors.push("DATABASE_URL must use postgresql://");
  if (databaseUrl.hostname !== "postgres") errors.push("DATABASE_URL must target the private postgres service");
  if (decodeURIComponent(databaseUrl.password) !== value("KURUBASE_API_PASSWORD")) errors.push("DATABASE_URL password must match KURUBASE_API_PASSWORD");
} catch {
  errors.push("DATABASE_URL must be a valid PostgreSQL URL");
}

if (value("IDENTITY_PROVIDER") === "oidc") {
  for (const [primary, legacy] of oidcAliases) {
    const effective = effectiveAlias(primary, legacy);
    if (!effective) errors.push(`Missing variable: ${primary} or ${legacy}`);
    if (value(primary) && value(legacy) && value(primary) !== value(legacy)) {
      errors.push(`${primary} and ${legacy} must not conflict`);
    }
    if (effective && placeholder.test(effective)) {
      errors.push(`Placeholder variable: ${value(primary) ? primary : legacy}`);
    }
  }

  const genericAlgorithms = value("OIDC_ALLOWED_ALGORITHMS")
    .split(",").map((entry) => entry.trim()).filter(Boolean).join(",");
  const legacyAlgorithms = value("KURUAUTH_ALLOWED_ALGORITHMS")
    .split(",").map((entry) => entry.trim()).filter(Boolean).join(",");
  if (genericAlgorithms && legacyAlgorithms && genericAlgorithms !== legacyAlgorithms) {
    errors.push("OIDC_ALLOWED_ALGORITHMS and KURUAUTH_ALLOWED_ALGORITHMS must not conflict");
  }

  for (const [primary, legacy] of [oidcAliases[0], oidcAliases[2]]) {
    const effective = effectiveAlias(primary, legacy);
    if (!effective) continue;
    try {
      const url = new URL(effective);
      if (url.protocol !== "https:") errors.push(`${primary} or ${legacy} must use HTTPS`);
    } catch {
      errors.push(`${primary} or ${legacy} must be a valid HTTPS URL`);
    }
  }
}

if (errors.length > 0) {
  console.error("Production environment validation failed:");
  for (const error of errors) console.error("- " + error);
  process.exitCode = 1;
} else {
  console.log("Production environment is valid for local startup.");
}
