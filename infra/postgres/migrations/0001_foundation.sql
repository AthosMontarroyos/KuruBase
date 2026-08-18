begin;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'kurubase_migrator') then
    create role kurubase_migrator
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'kurubase_api') then
    create role kurubase_api
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls;
  end if;
end
$$;

alter role kurubase_migrator nobypassrls;
alter role kurubase_api nobypassrls;

revoke create on schema public from public;
create schema if not exists api authorization kurubase_migrator;
create schema if not exists kurubase_private authorization kurubase_migrator;
revoke all on schema api from public;
revoke all on schema kurubase_private from public;
grant usage on schema api, kurubase_private to kurubase_api;

create or replace function kurubase_private.request_claims()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;

create or replace function kurubase_private.request_sub()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(kurubase_private.request_claims() ->> 'sub', '')
$$;

create or replace function kurubase_private.request_org_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(kurubase_private.request_claims() ->> 'org_id', '')
$$;

create or replace function kurubase_private.request_scopes()
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    array(
      select pg_catalog.jsonb_array_elements_text(
        coalesce(kurubase_private.request_claims() -> 'scopes', '[]'::jsonb)
      )
    ),
    array[]::text[]
  )
$$;

create or replace function kurubase_private.has_scope(required_scope text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select required_scope = any(kurubase_private.request_scopes())
$$;

revoke all on all functions in schema kurubase_private from public;
grant execute on function kurubase_private.request_claims() to kurubase_api;
grant execute on function kurubase_private.request_sub() to kurubase_api;
grant execute on function kurubase_private.request_org_id() to kurubase_api;
grant execute on function kurubase_private.request_scopes() to kurubase_api;
grant execute on function kurubase_private.has_scope(text) to kurubase_api;

create table if not exists api.records (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id text not null default kurubase_private.request_sub(),
  org_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint records_owner_id_not_empty check (owner_id <> ''),
  constraint records_data_is_object check (pg_catalog.jsonb_typeof(data) = 'object')
);

alter table api.records owner to kurubase_migrator;
alter table api.records enable row level security;
alter table api.records force row level security;

create index if not exists records_owner_id_idx on api.records (owner_id);
create index if not exists records_org_id_idx on api.records (org_id) where org_id is not null;
create index if not exists records_created_at_id_idx on api.records (created_at desc, id);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'api' and tablename = 'records' and policyname = 'records_select'
  ) then
    create policy records_select on api.records
      for select
      to kurubase_api
      using (
        owner_id = (select kurubase_private.request_sub())
        or (
          org_id is not null
          and org_id = (select kurubase_private.request_org_id())
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'api' and tablename = 'records' and policyname = 'records_insert'
  ) then
    create policy records_insert on api.records
      for insert
      to kurubase_api
      with check (
        owner_id = (select kurubase_private.request_sub())
        or (
          org_id is not null
          and org_id = (select kurubase_private.request_org_id())
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'api' and tablename = 'records' and policyname = 'records_update'
  ) then
    create policy records_update on api.records
      for update
      to kurubase_api
      using (
        owner_id = (select kurubase_private.request_sub())
        or (
          org_id is not null
          and org_id = (select kurubase_private.request_org_id())
        )
      )
      with check (
        owner_id = (select kurubase_private.request_sub())
        or (
          org_id is not null
          and org_id = (select kurubase_private.request_org_id())
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'api' and tablename = 'records' and policyname = 'records_delete'
  ) then
    create policy records_delete on api.records
      for delete
      to kurubase_api
      using (
        owner_id = (select kurubase_private.request_sub())
        or (
          org_id is not null
          and org_id = (select kurubase_private.request_org_id())
        )
      );
  end if;
end
$$;

revoke all on all tables in schema api from public;
grant select, insert, update, delete on api.records to kurubase_api;

alter default privileges for role kurubase_migrator in schema api
  revoke all on tables from public;
alter default privileges for role kurubase_migrator in schema api
  grant select, insert, update, delete on tables to kurubase_api;
alter default privileges for role kurubase_migrator in schema api
  revoke all on sequences from public;
alter default privileges for role kurubase_migrator in schema api
  grant usage, select on sequences to kurubase_api;

commit;
