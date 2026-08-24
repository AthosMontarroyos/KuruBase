begin;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'kurubase_identity_admin'
  ) then
    create role kurubase_identity_admin
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls;
  end if;
end
$$;

alter role kurubase_identity_admin
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  nobypassrls;

grant usage on schema kurubase_private to kurubase_identity_admin;

create or replace function kurubase_private.valid_principal_roles(candidate text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    candidate is not null
    and coalesce(pg_catalog.array_ndims(candidate), 1) = 1
    and pg_catalog.array_position(candidate, null) is null
    and candidate <@ array['member', 'operator', 'service']::text[]
    and pg_catalog.cardinality(candidate) = (
      select pg_catalog.count(distinct role_name)::integer
      from pg_catalog.unnest(candidate) as role_name
    )
$$;

create or replace function kurubase_private.valid_principal_scopes(candidate text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    candidate is not null
    and coalesce(pg_catalog.array_ndims(candidate), 1) = 1
    and pg_catalog.array_position(candidate, null) is null
    and candidate <@ array[
      'kurubase:data:read',
      'kurubase:data:write',
      'kurubase:org:write',
      'kurubase:admin'
    ]::text[]
    and pg_catalog.cardinality(candidate) = (
      select pg_catalog.count(distinct scope_name)::integer
      from pg_catalog.unnest(candidate) as scope_name
    )
$$;

create or replace function kurubase_private.valid_audit_actor_id(candidate text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    candidate is not null
    and candidate = pg_catalog.btrim(candidate)
    and candidate <> ''
    and pg_catalog.length(candidate) <= 255
$$;

alter function kurubase_private.valid_principal_roles(text[])
  owner to kurubase_migrator;
alter function kurubase_private.valid_principal_scopes(text[])
  owner to kurubase_migrator;
alter function kurubase_private.valid_audit_actor_id(text)
  owner to kurubase_migrator;
revoke all on function kurubase_private.valid_principal_roles(text[]) from public;
revoke all on function kurubase_private.valid_principal_scopes(text[]) from public;
revoke all on function kurubase_private.valid_audit_actor_id(text) from public;

create table if not exists kurubase_private.principals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  org_id text,
  roles text[] not null default array[]::text[],
  scopes text[] not null default array[]::text[],
  status text not null default 'active',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint principals_org_id_valid check (
    org_id is null
    or (
      org_id = pg_catalog.btrim(org_id)
      and org_id <> ''
      and pg_catalog.length(org_id) <= 255
    )
  ),
  constraint principals_roles_valid check (
    kurubase_private.valid_principal_roles(roles)
  ),
  constraint principals_scopes_valid check (
    kurubase_private.valid_principal_scopes(scopes)
  ),
  constraint principals_status_valid check (status in ('active', 'disabled')),
  constraint principals_timestamps_valid check (updated_at >= created_at)
);

alter table kurubase_private.principals owner to kurubase_migrator;

create table if not exists kurubase_private.external_identities (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  principal_id uuid not null references kurubase_private.principals(id) on delete restrict,
  provider text not null,
  issuer text not null,
  identity_kind text not null,
  external_subject text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint external_identities_provider_valid check (
    provider in ('cloudflare-access', 'oidc')
  ),
  constraint external_identities_issuer_valid check (
    issuer = pg_catalog.btrim(issuer)
    and issuer <> ''
    and issuer ~ '^https://'
    and pg_catalog.length(issuer) <= 2048
  ),
  constraint external_identities_kind_valid check (
    identity_kind in ('human', 'service')
  ),
  constraint external_identities_subject_valid check (
    external_subject <> ''
    and pg_catalog.length(external_subject) <= 2048
  ),
  constraint external_identities_lookup_unique unique (
    provider,
    issuer,
    identity_kind,
    external_subject
  )
);

alter table kurubase_private.external_identities owner to kurubase_migrator;

create index if not exists external_identities_principal_id_idx
  on kurubase_private.external_identities (principal_id);

create table if not exists kurubase_private.authorization_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default pg_catalog.now(),
  principal_id uuid not null references kurubase_private.principals(id) on delete restrict,
  actor_id text not null,
  database_actor text not null default session_user,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  constraint authorization_audit_actor_valid check (
    kurubase_private.valid_audit_actor_id(actor_id)
  ),
  constraint authorization_audit_database_actor_valid check (
    database_actor <> ''
    and pg_catalog.length(database_actor) <= 255
  ),
  constraint authorization_audit_action_valid check (
    action in (
      'principal.created',
      'identity.linked',
      'entitlement.granted',
      'entitlement.revoked',
      'principal.enabled',
      'principal.disabled'
    )
  ),
  constraint authorization_audit_details_valid check (
    pg_catalog.jsonb_typeof(details) = 'object'
  )
);

alter table kurubase_private.authorization_audit owner to kurubase_migrator;

comment on table kurubase_private.principals is
  'Private canonical principals. Access is available only through allowlisted functions.';
comment on table kurubase_private.external_identities is
  'Private exact external identity mappings. Subjects are never returned by administrative read functions.';
comment on table kurubase_private.authorization_audit is
  'Append-only authorization history; application and identity admin roles have no direct table privileges.';

create index if not exists authorization_audit_principal_time_idx
  on kurubase_private.authorization_audit (principal_id, occurred_at desc, id desc);

revoke all on table kurubase_private.principals from public, kurubase_api, kurubase_identity_admin;
revoke all on table kurubase_private.external_identities from public, kurubase_api, kurubase_identity_admin;
revoke all on table kurubase_private.authorization_audit from public, kurubase_api, kurubase_identity_admin;
revoke all on sequence kurubase_private.authorization_audit_id_seq
  from public, kurubase_api, kurubase_identity_admin;

create or replace function kurubase_private.resolve_principal(
  requested_provider text,
  requested_issuer text,
  requested_subject_type text,
  requested_subject text
)
returns table (
  sub text,
  org_id text,
  roles text[],
  scopes text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    principal.id::text as sub,
    principal.org_id,
    principal.roles,
    principal.scopes
  from kurubase_private.external_identities as external_identity
  join kurubase_private.principals as principal
    on principal.id = external_identity.principal_id
  where external_identity.provider = requested_provider
    and external_identity.issuer = requested_issuer
    and external_identity.identity_kind = requested_subject_type
    and external_identity.external_subject = requested_subject
    and principal.status = 'active'
$$;

alter function kurubase_private.resolve_principal(text, text, text, text)
  owner to kurubase_migrator;
comment on function kurubase_private.resolve_principal(text, text, text, text) is
  'SECURITY DEFINER is required because the API runtime has no table access; this exposes only one active canonical principal.';
revoke all on function kurubase_private.resolve_principal(text, text, text, text) from public;
grant execute on function kurubase_private.resolve_principal(text, text, text, text)
  to kurubase_api;

create or replace function kurubase_private.admin_create_principal(
  requested_principal_id uuid,
  requested_org_id text,
  requested_roles text[],
  requested_scopes text[],
  requested_actor_id text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_principal_id uuid := coalesce(requested_principal_id, pg_catalog.gen_random_uuid());
begin
  if not kurubase_private.valid_audit_actor_id(requested_actor_id) then
    raise exception using
      errcode = '22023',
      message = 'actor_id must be a non-empty opaque identifier of at most 255 characters';
  end if;

  if not kurubase_private.valid_principal_roles(requested_roles) then
    raise exception using errcode = '22023', message = 'invalid principal roles';
  end if;

  if not kurubase_private.valid_principal_scopes(requested_scopes) then
    raise exception using errcode = '22023', message = 'invalid principal scopes';
  end if;

  insert into kurubase_private.principals (id, org_id, roles, scopes)
  values (
    created_principal_id,
    requested_org_id,
    requested_roles,
    requested_scopes
  );

  insert into kurubase_private.authorization_audit (
    principal_id,
    actor_id,
    database_actor,
    action,
    details
  )
  values (
    created_principal_id,
    requested_actor_id,
    session_user,
    'principal.created',
    pg_catalog.jsonb_build_object(
      'org_id', requested_org_id,
      'roles', pg_catalog.to_jsonb(requested_roles),
      'scopes', pg_catalog.to_jsonb(requested_scopes)
    )
  );

  return created_principal_id;
end
$$;

alter function kurubase_private.admin_create_principal(uuid, text, text[], text[], text)
  owner to kurubase_migrator;
comment on function kurubase_private.admin_create_principal(uuid, text, text[], text[], text) is
  'SECURITY DEFINER funnels principal creation through validation and mandatory audit while the admin login has no table access.';
revoke all on function kurubase_private.admin_create_principal(uuid, text, text[], text[], text)
  from public, kurubase_api;
grant execute on function kurubase_private.admin_create_principal(uuid, text, text[], text[], text)
  to kurubase_identity_admin;

create or replace function kurubase_private.admin_link_identity(
  requested_principal_id uuid,
  requested_provider text,
  requested_issuer text,
  requested_identity_kind text,
  requested_external_subject text,
  requested_actor_id text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_identity_id uuid;
begin
  if not kurubase_private.valid_audit_actor_id(requested_actor_id) then
    raise exception using
      errcode = '22023',
      message = 'actor_id must be a non-empty opaque identifier of at most 255 characters';
  end if;

  insert into kurubase_private.external_identities (
    principal_id,
    provider,
    issuer,
    identity_kind,
    external_subject
  )
  values (
    requested_principal_id,
    requested_provider,
    requested_issuer,
    requested_identity_kind,
    requested_external_subject
  )
  returning id into created_identity_id;

  insert into kurubase_private.authorization_audit (
    principal_id,
    actor_id,
    database_actor,
    action,
    details
  )
  values (
    requested_principal_id,
    requested_actor_id,
    session_user,
    'identity.linked',
    pg_catalog.jsonb_build_object(
      'external_identity_id', created_identity_id,
      'provider', requested_provider,
      'issuer', requested_issuer,
      'identity_kind', requested_identity_kind
    )
  );

  return created_identity_id;
end
$$;

alter function kurubase_private.admin_link_identity(uuid, text, text, text, text, text)
  owner to kurubase_migrator;
comment on function kurubase_private.admin_link_identity(uuid, text, text, text, text, text) is
  'SECURITY DEFINER creates exact identity links and a redacted audit event while the admin login has no table access.';
revoke all on function kurubase_private.admin_link_identity(uuid, text, text, text, text, text)
  from public, kurubase_api;
grant execute on function kurubase_private.admin_link_identity(uuid, text, text, text, text, text)
  to kurubase_identity_admin;

create or replace function kurubase_private.admin_change_entitlement(
  requested_principal_id uuid,
  requested_entitlement_kind text,
  requested_entitlement text,
  requested_operation text,
  requested_actor_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  previous_values text[];
  next_values text[];
  changed boolean;
begin
  if not kurubase_private.valid_audit_actor_id(requested_actor_id) then
    raise exception using
      errcode = '22023',
      message = 'actor_id must be a non-empty opaque identifier of at most 255 characters';
  end if;

  if requested_operation is null or requested_operation not in ('grant', 'revoke') then
    raise exception using errcode = '22023', message = 'operation must be grant or revoke';
  end if;

  if requested_entitlement_kind = 'role' then
    if not kurubase_private.valid_principal_roles(array[requested_entitlement]) then
      raise exception using errcode = '22023', message = 'invalid principal role';
    end if;

    select roles
    into previous_values
    from kurubase_private.principals
    where id = requested_principal_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'principal not found';
    end if;

    if requested_operation = 'grant' then
      select pg_catalog.array_agg(role_name order by role_name)
      into next_values
      from (
        select distinct role_name
        from pg_catalog.unnest(previous_values || requested_entitlement) as role_name
      ) as unique_roles;
    else
      next_values := pg_catalog.array_remove(previous_values, requested_entitlement);
    end if;

    update kurubase_private.principals
    set roles = next_values, updated_at = pg_catalog.now()
    where id = requested_principal_id;
  elsif requested_entitlement_kind = 'scope' then
    if not kurubase_private.valid_principal_scopes(array[requested_entitlement]) then
      raise exception using errcode = '22023', message = 'invalid principal scope';
    end if;

    select scopes
    into previous_values
    from kurubase_private.principals
    where id = requested_principal_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'principal not found';
    end if;

    if requested_operation = 'grant' then
      select pg_catalog.array_agg(scope_name order by scope_name)
      into next_values
      from (
        select distinct scope_name
        from pg_catalog.unnest(previous_values || requested_entitlement) as scope_name
      ) as unique_scopes;
    else
      next_values := pg_catalog.array_remove(previous_values, requested_entitlement);
    end if;

    update kurubase_private.principals
    set scopes = next_values, updated_at = pg_catalog.now()
    where id = requested_principal_id;
  else
    raise exception using errcode = '22023', message = 'entitlement kind must be role or scope';
  end if;

  changed := previous_values is distinct from next_values;

  insert into kurubase_private.authorization_audit (
    principal_id,
    actor_id,
    database_actor,
    action,
    details
  )
  values (
    requested_principal_id,
    requested_actor_id,
    session_user,
    case requested_operation
      when 'grant' then 'entitlement.granted'
      else 'entitlement.revoked'
    end,
    pg_catalog.jsonb_build_object(
      'kind', requested_entitlement_kind,
      'value', requested_entitlement,
      'changed', changed
    )
  );
end
$$;

alter function kurubase_private.admin_change_entitlement(uuid, text, text, text, text)
  owner to kurubase_migrator;
comment on function kurubase_private.admin_change_entitlement(uuid, text, text, text, text) is
  'SECURITY DEFINER serializes allowlisted authorization changes and records every requested grant or revoke.';
revoke all on function kurubase_private.admin_change_entitlement(uuid, text, text, text, text)
  from public, kurubase_api;
grant execute on function kurubase_private.admin_change_entitlement(uuid, text, text, text, text)
  to kurubase_identity_admin;

create or replace function kurubase_private.admin_set_principal_status(
  requested_principal_id uuid,
  requested_status text,
  requested_actor_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  previous_status text;
begin
  if not kurubase_private.valid_audit_actor_id(requested_actor_id) then
    raise exception using
      errcode = '22023',
      message = 'actor_id must be a non-empty opaque identifier of at most 255 characters';
  end if;

  if requested_status is null or requested_status not in ('active', 'disabled') then
    raise exception using errcode = '22023', message = 'status must be active or disabled';
  end if;

  select status
  into previous_status
  from kurubase_private.principals
  where id = requested_principal_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'principal not found';
  end if;

  update kurubase_private.principals
  set status = requested_status, updated_at = pg_catalog.now()
  where id = requested_principal_id;

  insert into kurubase_private.authorization_audit (
    principal_id,
    actor_id,
    database_actor,
    action,
    details
  )
  values (
    requested_principal_id,
    requested_actor_id,
    session_user,
    case requested_status
      when 'active' then 'principal.enabled'
      else 'principal.disabled'
    end,
    pg_catalog.jsonb_build_object(
      'previous_status', previous_status,
      'status', requested_status,
      'changed', previous_status is distinct from requested_status
    )
  );
end
$$;

alter function kurubase_private.admin_set_principal_status(uuid, text, text)
  owner to kurubase_migrator;
comment on function kurubase_private.admin_set_principal_status(uuid, text, text) is
  'SECURITY DEFINER changes only principal status and records the operation while the admin login has no table access.';
revoke all on function kurubase_private.admin_set_principal_status(uuid, text, text)
  from public, kurubase_api;
grant execute on function kurubase_private.admin_set_principal_status(uuid, text, text)
  to kurubase_identity_admin;

create or replace function kurubase_private.admin_get_principal(
  requested_principal_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', principal.id,
    'org_id', principal.org_id,
    'roles', pg_catalog.to_jsonb(principal.roles),
    'scopes', pg_catalog.to_jsonb(principal.scopes),
    'status', principal.status,
    'created_at', principal.created_at,
    'updated_at', principal.updated_at,
    'external_identities', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', external_identity.id,
            'provider', external_identity.provider,
            'issuer', external_identity.issuer,
            'identity_kind', external_identity.identity_kind,
            'created_at', external_identity.created_at
          )
          order by external_identity.created_at, external_identity.id
        )
        from kurubase_private.external_identities as external_identity
        where external_identity.principal_id = principal.id
      ),
      '[]'::jsonb
    )
  )
  from kurubase_private.principals as principal
  where principal.id = requested_principal_id
$$;

alter function kurubase_private.admin_get_principal(uuid)
  owner to kurubase_migrator;
comment on function kurubase_private.admin_get_principal(uuid) is
  'SECURITY DEFINER exposes a redacted administrative view without returning external identity subjects.';
revoke all on function kurubase_private.admin_get_principal(uuid)
  from public, kurubase_api;
grant execute on function kurubase_private.admin_get_principal(uuid)
  to kurubase_identity_admin;

create or replace function kurubase_private.admin_get_authorization_audit(
  requested_principal_id uuid,
  requested_limit integer default 100
)
returns table (
  id bigint,
  occurred_at timestamptz,
  actor_id text,
  database_actor text,
  action text,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if requested_limit is null or requested_limit < 1 or requested_limit > 1000 then
    raise exception using errcode = '22023', message = 'audit limit must be between 1 and 1000';
  end if;

  return query
  select
    audit.id,
    audit.occurred_at,
    audit.actor_id,
    audit.database_actor,
    audit.action,
    audit.details
  from kurubase_private.authorization_audit as audit
  where audit.principal_id = requested_principal_id
  order by audit.occurred_at desc, audit.id desc
  limit requested_limit;
end
$$;

alter function kurubase_private.admin_get_authorization_audit(uuid, integer)
  owner to kurubase_migrator;
comment on function kurubase_private.admin_get_authorization_audit(uuid, integer) is
  'SECURITY DEFINER exposes bounded audit history while the admin login has no direct audit table access.';
revoke all on function kurubase_private.admin_get_authorization_audit(uuid, integer)
  from public, kurubase_api;
grant execute on function kurubase_private.admin_get_authorization_audit(uuid, integer)
  to kurubase_identity_admin;

create or replace function kurubase_private.can_read_record(
  record_owner_id text,
  record_org_id text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    record_owner_id = kurubase_private.request_sub()
    or (
      record_org_id is not null
      and record_org_id = kurubase_private.request_org_id()
    )
$$;

create or replace function kurubase_private.can_write_record(
  record_owner_id text,
  record_org_id text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    record_owner_id = kurubase_private.request_sub()
    or (
      record_org_id is not null
      and record_org_id = kurubase_private.request_org_id()
      and kurubase_private.has_scope('kurubase:org:write')
    )
$$;

create or replace function kurubase_private.can_insert_record(
  record_owner_id text,
  record_org_id text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      record_owner_id = kurubase_private.request_sub()
      and (
        record_org_id is null
        or record_org_id = kurubase_private.request_org_id()
      )
    )
    or (
      record_org_id is not null
      and record_org_id = kurubase_private.request_org_id()
      and kurubase_private.has_scope('kurubase:org:write')
    )
$$;

alter function kurubase_private.can_read_record(text, text)
  owner to kurubase_migrator;
alter function kurubase_private.can_write_record(text, text)
  owner to kurubase_migrator;
alter function kurubase_private.can_insert_record(text, text)
  owner to kurubase_migrator;
revoke all on function kurubase_private.can_read_record(text, text) from public;
revoke all on function kurubase_private.can_write_record(text, text) from public;
revoke all on function kurubase_private.can_insert_record(text, text) from public;
grant execute on function kurubase_private.can_read_record(text, text) to kurubase_api;
grant execute on function kurubase_private.can_write_record(text, text) to kurubase_api;
grant execute on function kurubase_private.can_insert_record(text, text) to kurubase_api;

create or replace function kurubase_private.reject_record_identity_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
    or new.org_id is distinct from old.org_id then
    raise exception using
      errcode = '42501',
      message = 'owner_id and org_id are immutable';
  end if;

  return new;
end
$$;

alter function kurubase_private.reject_record_identity_change()
  owner to kurubase_migrator;
revoke all on function kurubase_private.reject_record_identity_change() from public;

drop trigger if exists records_reject_identity_change on api.records;
create trigger records_reject_identity_change
before update of owner_id, org_id on api.records
for each row
execute function kurubase_private.reject_record_identity_change();

drop policy if exists records_select on api.records;
create policy records_select on api.records
  for select
  to kurubase_api
  using (
    kurubase_private.can_read_record(owner_id, org_id)
  );

drop policy if exists records_insert on api.records;
create policy records_insert on api.records
  for insert
  to kurubase_api
  with check (
    kurubase_private.can_insert_record(owner_id, org_id)
  );

drop policy if exists records_update on api.records;
create policy records_update on api.records
  for update
  to kurubase_api
  using (
    kurubase_private.can_write_record(owner_id, org_id)
  )
  with check (
    kurubase_private.can_write_record(owner_id, org_id)
  );

drop policy if exists records_delete on api.records;
create policy records_delete on api.records
  for delete
  to kurubase_api
  using (
    kurubase_private.can_write_record(owner_id, org_id)
  );

alter table api.records enable row level security;
alter table api.records force row level security;

commit;
