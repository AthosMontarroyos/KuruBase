import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import type { RlsIdentity } from "../../src/types.js";

const runtimeDatabaseUrl = process.env.TEST_DATABASE_URL;
const identityAdminDatabaseUrl = process.env.TEST_IDENTITY_ADMIN_DATABASE_URL;
const rlsIntegration = runtimeDatabaseUrl ? describe : describe.skip;
const identityIntegration = runtimeDatabaseUrl && identityAdminDatabaseUrl
  ? describe
  : describe.skip;

async function setClaims(client: PoolClient, identity: RlsIdentity): Promise<void> {
  await client.query("select pg_catalog.set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(identity)
  ]);
}

function identity(
  sub: string,
  orgId: string | null,
  scopes: RlsIdentity["scopes"] = []
): RlsIdentity {
  return { sub, org_id: orgId, roles: ["member"], scopes };
}

rlsIntegration("organization-aware record RLS", () => {
  let runtimePool: Pool;

  beforeAll(() => {
    runtimePool = new Pool({
      connectionString: runtimeDatabaseUrl ?? "postgresql://unused",
      max: 2
    });
  });

  afterAll(async () => {
    await runtimePool.end();
  });

  it("allows organization reads and gates organization writes while preserving row identity", async () => {
    const client = await runtimePool.connect();
    const owner = `owner-${randomUUID()}`;
    const colleague = `colleague-${randomUUID()}`;
    const outsider = `outsider-${randomUUID()}`;
    const org = `org-${randomUUID()}`;
    const otherOrg = `org-${randomUUID()}`;

    try {
      await client.query("begin");
      await setClaims(client, identity(owner, org));
      const inserted = await client.query<{ id: string }>(
        `
          insert into api.records (owner_id, org_id, data)
          values ($1, $2, $3::jsonb)
          returning id
        `,
        [owner, org, JSON.stringify({ state: "created" })]
      );
      const recordId = inserted.rows[0].id;

      await setClaims(client, identity(colleague, org));
      const organizationRead = await client.query<{ id: string }>(
        "select id from api.records where id = $1::uuid",
        [recordId]
      );
      expect(organizationRead.rows).toHaveLength(1);

      const deniedOrganizationUpdate = await client.query(
        `update api.records set data = $1::jsonb where id = $2::uuid returning id`,
        [JSON.stringify({ state: "denied" }), recordId]
      );
      expect(deniedOrganizationUpdate.rows).toEqual([]);

      await setClaims(client, identity(colleague, org, ["kurubase:org:write"]));
      const allowedOrganizationUpdate = await client.query<{ data: { state: string } }>(
        `update api.records set data = $1::jsonb where id = $2::uuid returning data`,
        [JSON.stringify({ state: "organization-write" }), recordId]
      );
      expect(allowedOrganizationUpdate.rows[0].data).toEqual({ state: "organization-write" });

      await client.query("savepoint immutable_owner");
      await expect(
        client.query(
          "update api.records set owner_id = $1 where id = $2::uuid",
          [colleague, recordId]
        )
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback to savepoint immutable_owner");

      await client.query("savepoint immutable_org");
      await expect(
        client.query(
          "update api.records set org_id = $1 where id = $2::uuid",
          [otherOrg, recordId]
        )
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback to savepoint immutable_org");

      await setClaims(client, identity(outsider, otherOrg, ["kurubase:org:write"]));
      const crossOrganizationRead = await client.query(
        "select id from api.records where id = $1::uuid",
        [recordId]
      );
      expect(crossOrganizationRead.rows).toEqual([]);
      const crossOrganizationUpdate = await client.query(
        `update api.records set data = $1::jsonb where id = $2::uuid returning id`,
        [JSON.stringify({ state: "cross-org" }), recordId]
      );
      expect(crossOrganizationUpdate.rows).toEqual([]);

      await client.query("savepoint cross_org_insert");
      await expect(
        client.query(
          `insert into api.records (owner_id, org_id, data) values ($1, $2, '{}'::jsonb)`,
          [outsider, org]
        )
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback to savepoint cross_org_insert");

      await setClaims(client, identity(owner, org));
      const ownerDelete = await client.query(
        "delete from api.records where id = $1::uuid returning id",
        [recordId]
      );
      expect(ownerDelete.rows).toHaveLength(1);
      await client.query("rollback");

      await client.query("begin");
      const clearedClaims = await client.query<{
        claims: Record<string, never>;
        sub: string | null;
      }>(
        `
          select
            kurubase_private.request_claims() as claims,
            kurubase_private.request_sub() as sub
        `
      );
      expect(clearedClaims.rows[0]).toEqual({ claims: {}, sub: null });
      await client.query("rollback");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
});

identityIntegration("private principal map", () => {
  let runtimePool: Pool;
  let adminPool: Pool;

  beforeAll(() => {
    runtimePool = new Pool({
      connectionString: runtimeDatabaseUrl ?? "postgresql://unused",
      max: 2
    });
    adminPool = new Pool({
      connectionString: identityAdminDatabaseUrl ?? "postgresql://unused",
      max: 2
    });
  });

  afterAll(async () => {
    await Promise.all([runtimePool.end(), adminPool.end()]);
  });

  it("resolves only active mapped identities through the least-privilege function", async () => {
    const actorId = `test-operator-${randomUUID()}`;
    const orgId = `org-${randomUUID()}`;
    const externalSubject = `subject-${randomUUID()}`;
    const issuer = "https://integration.cloudflareaccess.com";
    let principalId: string | undefined;

    try {
      const created = await adminPool.query<{ principal_id: string }>(
        `
          select kurubase_private.admin_create_principal(
            null::uuid,
            $1::text,
            $2::text[],
            $3::text[],
            $4::text
          ) as principal_id
        `,
        [orgId, ["member"], ["kurubase:data:read"], actorId]
      );
      principalId = created.rows[0].principal_id;

      await expect(
        adminPool.query(
          `
            select kurubase_private.admin_link_identity(
              $1::uuid,
              'unsupported-provider'::text,
              $2::text,
              'human'::text,
              $3::text,
              $4::text
            )
          `,
          [principalId, issuer, externalSubject, actorId]
        )
      ).rejects.toMatchObject({ code: "23514" });

      await expect(
        adminPool.query(
          `
            select kurubase_private.admin_link_identity(
              $1::uuid,
              'cloudflare-access'::text,
              'http://integration.cloudflareaccess.com'::text,
              'human'::text,
              $2::text,
              $3::text
            )
          `,
          [principalId, externalSubject, actorId]
        )
      ).rejects.toMatchObject({ code: "23514" });

      await adminPool.query(
        `
          select kurubase_private.admin_link_identity(
            $1::uuid,
            'cloudflare-access'::text,
            $2::text,
            'human'::text,
            $3::text,
            $4::text
          )
        `,
        [principalId, issuer, externalSubject, actorId]
      );

      const resolved = await runtimePool.query<{
        sub: string;
        org_id: string;
        roles: string[];
        scopes: string[];
      }>(
        `
          select sub, org_id, roles, scopes
          from kurubase_private.resolve_principal($1::text, $2::text, $3::text, $4::text)
        `,
        ["cloudflare-access", issuer, "human", externalSubject]
      );
      expect(resolved.rows).toEqual([
        {
          sub: principalId,
          org_id: orgId,
          roles: ["member"],
          scopes: ["kurubase:data:read"]
        }
      ]);

      const wrongAudienceIdentity = await runtimePool.query(
        `select sub from kurubase_private.resolve_principal($1, $2, $3, $4)`,
        ["cloudflare-access", `${issuer}/wrong`, "human", externalSubject]
      );
      expect(wrongAudienceIdentity.rows).toEqual([]);

      await expect(
        adminPool.query(
          `select kurubase_private.admin_change_entitlement($1, 'role', 'owner', 'grant', $2)`,
          [principalId, actorId]
        )
      ).rejects.toMatchObject({ code: "22023" });

      await adminPool.query(
        `select kurubase_private.admin_change_entitlement($1, 'scope', $2, 'grant', $3)`,
        [principalId, "kurubase:data:write", actorId]
      );

      const principalView = await adminPool.query<{ principal: unknown }>(
        `select kurubase_private.admin_get_principal($1::uuid) as principal`,
        [principalId]
      );
      expect(JSON.stringify(principalView.rows[0].principal)).not.toContain(externalSubject);

      const privileges = await Promise.all([
        runtimePool.query<{
          direct_select: boolean;
          direct_mutation: boolean;
          can_resolve: boolean;
          can_administer: boolean;
        }>(
          `
            select
              pg_catalog.has_table_privilege(
                current_user,
                'kurubase_private.principals',
                'select'
              ) as direct_select,
              (
                pg_catalog.has_table_privilege(
                  current_user,
                  'kurubase_private.principals',
                  'insert'
                )
                or pg_catalog.has_table_privilege(
                  current_user,
                  'kurubase_private.principals',
                  'update'
                )
                or pg_catalog.has_table_privilege(
                  current_user,
                  'kurubase_private.principals',
                  'delete'
                )
              ) as direct_mutation,
              pg_catalog.has_function_privilege(
                current_user,
                'kurubase_private.resolve_principal(text,text,text,text)',
                'execute'
              ) as can_resolve,
              pg_catalog.has_function_privilege(
                current_user,
                'kurubase_private.admin_create_principal(uuid,text,text[],text[],text)',
                'execute'
              ) as can_administer
          `
        ),
        adminPool.query<{
          direct_select: boolean;
          direct_mutation: boolean;
          can_resolve: boolean;
          can_administer: boolean;
        }>(
          `
            select
              pg_catalog.has_table_privilege(
                current_user,
                'kurubase_private.principals',
                'select'
              ) as direct_select,
              (
                pg_catalog.has_table_privilege(
                  current_user,
                  'kurubase_private.principals',
                  'insert'
                )
                or pg_catalog.has_table_privilege(
                  current_user,
                  'kurubase_private.principals',
                  'update'
                )
                or pg_catalog.has_table_privilege(
                  current_user,
                  'kurubase_private.principals',
                  'delete'
                )
              ) as direct_mutation,
              pg_catalog.has_function_privilege(
                current_user,
                'kurubase_private.resolve_principal(text,text,text,text)',
                'execute'
              ) as can_resolve,
              pg_catalog.has_function_privilege(
                current_user,
                'kurubase_private.admin_create_principal(uuid,text,text[],text[],text)',
                'execute'
              ) as can_administer
          `
        )
      ]);
      expect(privileges[0].rows[0]).toEqual({
        direct_select: false,
        direct_mutation: false,
        can_resolve: true,
        can_administer: false
      });
      expect(privileges[1].rows[0]).toEqual({
        direct_select: false,
        direct_mutation: false,
        can_resolve: false,
        can_administer: true
      });

      const databaseRoles = await runtimePool.query<{
        rolname: string;
        superuser: boolean;
        inherit: boolean;
        bypass_rls: boolean;
      }>(
        `
          select
            rolname,
            rolsuper as superuser,
            rolinherit as inherit,
            rolbypassrls as bypass_rls
          from pg_catalog.pg_roles
          where rolname in ('kurubase_api', 'kurubase_identity_admin')
          order by rolname
        `
      );
      expect(databaseRoles.rows).toEqual([
        {
          rolname: "kurubase_api",
          superuser: false,
          inherit: false,
          bypass_rls: false
        },
        {
          rolname: "kurubase_identity_admin",
          superuser: false,
          inherit: false,
          bypass_rls: false
        }
      ]);

      const functionSecurity = await runtimePool.query<{
        owner: string;
        security_definer: boolean;
        settings: string[];
      }>(
        `
          select
            pg_catalog.pg_get_userbyid(procedure.proowner) as owner,
            procedure.prosecdef as security_definer,
            procedure.proconfig as settings
          from pg_catalog.pg_proc as procedure
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'kurubase_private'
            and procedure.proname = 'resolve_principal'
        `
      );
      expect(functionSecurity.rows[0].owner).toBe("kurubase_migrator");
      expect(functionSecurity.rows[0].security_definer).toBe(true);
      expect(functionSecurity.rows[0].settings).toContain("search_path=\"\"");

      await adminPool.query(
        `select kurubase_private.admin_set_principal_status($1, 'disabled', $2)`,
        [principalId, actorId]
      );
      const disabledResolution = await runtimePool.query(
        `select sub from kurubase_private.resolve_principal($1, $2, $3, $4)`,
        ["cloudflare-access", issuer, "human", externalSubject]
      );
      expect(disabledResolution.rows).toEqual([]);

      const audit = await adminPool.query<{
        actor_id: string;
        database_actor: string;
        action: string;
        details: Record<string, unknown>;
      }>(
        `
          select actor_id, database_actor, action, details
          from kurubase_private.admin_get_authorization_audit($1::uuid, 100)
        `,
        [principalId]
      );
      expect(audit.rows.every((row) => row.actor_id === actorId)).toBe(true);
      expect(
        audit.rows.every((row) => row.database_actor === "kurubase_identity_admin")
      ).toBe(true);
      expect(audit.rows.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          "principal.created",
          "identity.linked",
          "entitlement.granted",
          "principal.disabled"
        ])
      );
      expect(JSON.stringify(audit.rows)).not.toContain(externalSubject);
    } finally {
      if (principalId) {
        await adminPool.query(
          `select kurubase_private.admin_set_principal_status($1, 'disabled', $2)`,
          [principalId, actorId]
        ).catch(() => undefined);
      }
    }
  });
});
