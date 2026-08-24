#!/usr/bin/env node

import process from "node:process";
import { Client } from "pg";

const HELP = `KuruBase identity authorization administration

Usage:
  npm run identity:admin -- <command> [options]

Commands:
  create-principal   --actor ID [--principal UUID] [--org ID] [--role ROLE]... [--scope SCOPE]...
  link-identity      --actor ID --principal UUID --provider NAME --issuer URL --kind human|service
  grant-role         --actor ID --principal UUID --role ROLE
  revoke-role        --actor ID --principal UUID --role ROLE
  grant-scope        --actor ID --principal UUID --scope SCOPE
  revoke-scope       --actor ID --principal UUID --scope SCOPE
  enable-principal   --actor ID --principal UUID
  disable-principal  --actor ID --principal UUID
  get-principal      --principal UUID
  audit              --principal UUID [--limit 100]

Environment:
  KURUBASE_IDENTITY_ADMIN_DATABASE_URL  Required PostgreSQL URL whose user is kurubase_identity_admin.
  KURUBASE_IDENTITY_ADMIN_ACTOR         Optional default opaque actor ID for mutating commands.
  KURUBASE_IDENTITY_EXTERNAL_SUBJECT    Required only by link-identity; kept out of process arguments.

The CLI never prints connection credentials or external identity subjects.
`;

function fail(message) {
  throw new Error(message);
}

function parseOptions(tokens) {
  const options = new Map();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token?.startsWith("--") || token.length === 2) {
      fail(`Unexpected argument: ${token ?? ""}`);
    }

    const name = token.slice(2);
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`Option --${name} requires a value`);
    }

    const existing = options.get(name) ?? [];
    existing.push(value);
    options.set(name, existing);
    index += 1;
  }

  return options;
}

function assertAllowedOptions(options, allowed) {
  for (const name of options.keys()) {
    if (!allowed.has(name)) fail(`Unknown option: --${name}`);
  }
}

function one(options, name, { required = true } = {}) {
  const values = options.get(name) ?? [];
  if (values.length > 1) fail(`Option --${name} may only be provided once`);
  if (required && values.length === 0) fail(`Missing required option: --${name}`);
  return values[0] ?? null;
}

function many(options, name) {
  return [...new Set(options.get(name) ?? [])];
}

function actorId(options) {
  const fromOption = one(options, "actor", { required: false });
  const actor = fromOption ?? process.env.KURUBASE_IDENTITY_ADMIN_ACTOR ?? null;
  if (!actor) {
    fail("A mutating command requires --actor or KURUBASE_IDENTITY_ADMIN_ACTOR");
  }
  return actor;
}

function adminDatabaseUrl() {
  const raw = process.env.KURUBASE_IDENTITY_ADMIN_DATABASE_URL;
  if (!raw) fail("KURUBASE_IDENTITY_ADMIN_DATABASE_URL is required");

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail("KURUBASE_IDENTITY_ADMIN_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    fail("KURUBASE_IDENTITY_ADMIN_DATABASE_URL must use postgresql://");
  }
  if (decodeURIComponent(parsed.username) !== "kurubase_identity_admin") {
    fail("KURUBASE_IDENTITY_ADMIN_DATABASE_URL must use the kurubase_identity_admin login");
  }
  if (!parsed.password) {
    fail("KURUBASE_IDENTITY_ADMIN_DATABASE_URL must include the dedicated admin password");
  }

  return raw;
}

async function createPrincipal(client, options) {
  assertAllowedOptions(options, new Set(["actor", "principal", "org", "role", "scope"]));
  const result = await client.query(
    `
      select kurubase_private.admin_create_principal(
        $1::uuid,
        $2::text,
        $3::text[],
        $4::text[],
        $5::text
      ) as principal_id
    `,
    [
      one(options, "principal", { required: false }),
      one(options, "org", { required: false }),
      many(options, "role"),
      many(options, "scope"),
      actorId(options)
    ]
  );
  return { principal_id: result.rows[0].principal_id };
}

async function linkIdentity(client, options) {
  assertAllowedOptions(
    options,
    new Set(["actor", "principal", "provider", "issuer", "kind"])
  );
  const externalSubject = process.env.KURUBASE_IDENTITY_EXTERNAL_SUBJECT;
  if (!externalSubject) {
    fail("link-identity requires KURUBASE_IDENTITY_EXTERNAL_SUBJECT");
  }
  const result = await client.query(
    `
      select kurubase_private.admin_link_identity(
        $1::uuid,
        $2::text,
        $3::text,
        $4::text,
        $5::text,
        $6::text
      ) as external_identity_id
    `,
    [
      one(options, "principal"),
      one(options, "provider"),
      one(options, "issuer"),
      one(options, "kind"),
      externalSubject,
      actorId(options)
    ]
  );
  return {
    principal_id: one(options, "principal"),
    external_identity_id: result.rows[0].external_identity_id
  };
}

async function changeEntitlement(client, options, kind, operation) {
  const valueOption = kind === "role" ? "role" : "scope";
  assertAllowedOptions(options, new Set(["actor", "principal", valueOption]));
  const principalId = one(options, "principal");
  await client.query(
    `
      select kurubase_private.admin_change_entitlement(
        $1::uuid,
        $2::text,
        $3::text,
        $4::text,
        $5::text
      )
    `,
    [principalId, kind, one(options, valueOption), operation, actorId(options)]
  );
  return { principal_id: principalId, kind, operation, value: one(options, valueOption) };
}

async function setPrincipalStatus(client, options, status) {
  assertAllowedOptions(options, new Set(["actor", "principal"]));
  const principalId = one(options, "principal");
  await client.query(
    `
      select kurubase_private.admin_set_principal_status(
        $1::uuid,
        $2::text,
        $3::text
      )
    `,
    [principalId, status, actorId(options)]
  );
  return { principal_id: principalId, status };
}

async function getPrincipal(client, options) {
  assertAllowedOptions(options, new Set(["principal"]));
  const result = await client.query(
    `select kurubase_private.admin_get_principal($1::uuid) as principal`,
    [one(options, "principal")]
  );
  if (!result.rows[0]?.principal) fail("Principal not found");
  return result.rows[0].principal;
}

async function getAudit(client, options) {
  assertAllowedOptions(options, new Set(["principal", "limit"]));
  const rawLimit = one(options, "limit", { required: false }) ?? "100";
  if (!/^\d+$/.test(rawLimit)) fail("--limit must be an integer between 1 and 1000");

  const result = await client.query(
    `
      select id, occurred_at, actor_id, database_actor, action, details
      from kurubase_private.admin_get_authorization_audit($1::uuid, $2::integer)
    `,
    [one(options, "principal"), Number(rawLimit)]
  );
  return result.rows;
}

async function executeCommand(client, command, options) {
  switch (command) {
    case "create-principal":
      return createPrincipal(client, options);
    case "link-identity":
      return linkIdentity(client, options);
    case "grant-role":
      return changeEntitlement(client, options, "role", "grant");
    case "revoke-role":
      return changeEntitlement(client, options, "role", "revoke");
    case "grant-scope":
      return changeEntitlement(client, options, "scope", "grant");
    case "revoke-scope":
      return changeEntitlement(client, options, "scope", "revoke");
    case "enable-principal":
      return setPrincipalStatus(client, options, "active");
    case "disable-principal":
      return setPrincipalStatus(client, options, "disabled");
    case "get-principal":
      return getPrincipal(client, options);
    case "audit":
      return getAudit(client, options);
    default:
      fail(`Unknown command: ${command}`);
  }
}

async function main() {
  const [command, ...tokens] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (tokens.includes("--help")) {
    process.stdout.write(HELP);
    return;
  }

  const client = new Client({
    connectionString: adminDatabaseUrl(),
    application_name: "kurubase-identity-admin"
  });

  try {
    await client.connect();
    await client.query(`select pg_catalog.set_config('statement_timeout', $1, false)`, ["10000"]);
    const output = await executeCommand(client, command, parseOptions(tokens));
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  const code = typeof error?.code === "string" ? ` [SQLSTATE ${error.code}]` : "";
  const message = error instanceof Error ? error.message.split("\n", 1)[0] : "Unknown error";
  process.stderr.write(`Identity administration failed${code}: ${message}\n`);
  process.exitCode = 1;
});
