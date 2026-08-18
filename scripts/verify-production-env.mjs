const required = [
  "NODE_ENV", "DATABASE_URL", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD",
  "KURUBASE_API_PASSWORD", "KURUAUTH_ISSUER", "KURUAUTH_AUDIENCE", "KURUAUTH_JWKS_URL",
  "CLOUDFLARE_ACCESS_REQUIRED", "CLOUDFLARE_ACCESS_TEAM_DOMAIN",
  "CLOUDFLARE_ACCESS_AUDIENCE", "CLOUDFLARE_TUNNEL_TOKEN"
];

const value = (name) => process.env[name] ?? "";
const placeholder = /replace_with|your[-_.]|example\\.com|example\\.test|changeme|change-me/i;
const missing = required.filter((name) => !value(name));
const invalid = required.filter((name) => value(name) && placeholder.test(value(name)));
const errors = [];

if (missing.length > 0) errors.push("Missing variables: " + missing.join(", "));
if (invalid.length > 0) errors.push("Placeholder variables: " + invalid.join(", "));
if (value("NODE_ENV") !== "production") errors.push("NODE_ENV must be production");
if (value("CLOUDFLARE_ACCESS_REQUIRED") !== "true") errors.push("CLOUDFLARE_ACCESS_REQUIRED must be true in production");
if (value("POSTGRES_USER") === "postgres") errors.push("POSTGRES_USER must be a dedicated owner role, not postgres");
if (value("POSTGRES_PASSWORD").length < 32) errors.push("POSTGRES_PASSWORD must contain at least 32 characters");
if (value("KURUBASE_API_PASSWORD").length < 32) errors.push("KURUBASE_API_PASSWORD must contain at least 32 characters");
if (value("POSTGRES_PASSWORD") === value("KURUBASE_API_PASSWORD")) errors.push("POSTGRES_PASSWORD and KURUBASE_API_PASSWORD must be different");

try {
  const databaseUrl = new URL(value("DATABASE_URL"));
  if (databaseUrl.protocol !== "postgresql:") errors.push("DATABASE_URL must use postgresql://");
  if (databaseUrl.hostname !== "postgres") errors.push("DATABASE_URL must target the private postgres service");
  if (decodeURIComponent(databaseUrl.password) !== value("KURUBASE_API_PASSWORD")) errors.push("DATABASE_URL password must match KURUBASE_API_PASSWORD");
} catch {
  errors.push("DATABASE_URL must be a valid PostgreSQL URL");
}

for (const name of ["KURUAUTH_ISSUER", "KURUAUTH_JWKS_URL"]) {
  try {
    const url = new URL(value(name));
    if (url.protocol !== "https:") errors.push(name + " must use HTTPS");
  } catch {
    errors.push(name + " must be a valid HTTPS URL");
  }
}

if (errors.length > 0) {
  console.error("Production environment validation failed:");
  for (const error of errors) console.error("- " + error);
  process.exit(1);
}

console.log("Production environment is valid for local startup.");
