-- Supabase schema for an app built from this template.
--
-- Apply in the Supabase dashboard → SQL Editor, or with `supabase db push`.
-- Safe to re-run: every statement is idempotent.
--
-- Two things here are load-bearing and easy to get wrong:
--   1. RLS policies wrap auth.uid() in a subquery. See the note below.
--   2. delete_own_account() is what makes account deletion possible at all —
--      the client SDK cannot delete an auth user.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
-- One row per user, created automatically on signup. `on delete cascade` is
-- what lets deleting the auth user clean up app data without extra code.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  name        text,
  avatar_url  text,
  updated_at  timestamptz default now()
);

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Table grants
-- ---------------------------------------------------------------------------
-- These are load-bearing and easy to miss, because the failure looks like an RLS
-- bug and isn't one.
--
-- RLS *narrows* access that a GRANT has already allowed — it never creates it. A
-- table created by running SQL (here, the SQL Editor or `supabase db push`) gets
-- no data privileges for the PostgREST roles: `anon`, `authenticated` and
-- `service_role` come out holding only REFERENCES/TRIGGER/TRUNCATE. Without the
-- grants below every policy above is a dead letter and the first
-- `supabase.from("profiles").select()` fails with:
--
--   permission denied for table profiles
--
-- Tables created through the dashboard's Table Editor get these grants applied
-- for you, which is why the gap only bites people who apply schema.sql as SQL.
--
-- Deliberately NOT granted:
--   • anything to `anon` — every policy above is `to authenticated`, so an
--     anonymous caller has no policy that could ever pass;
--   • DELETE to `authenticated` — profiles are removed by the `on delete cascade`
--     when the auth user goes, and there is no delete policy to gate it.

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
-- Two non-obvious performance rules, both from Supabase's own RLS guide:
--
--   • Wrap the function call: `(select auth.uid()) = id`, NOT `auth.uid() = id`.
--     The subquery form lets Postgres cache the result as an initPlan and
--     evaluate it once per query instead of once per row. Supabase measures
--     94-99% improvements on large tables. The naive form works fine on 100
--     rows and falls over at 100k, which is the worst way to discover it.
--
--   • Always add `to authenticated`. Without it the policy is also evaluated
--     for anonymous requests that can never satisfy it.
--
-- Index every column a policy references, or each check is a sequential scan.

create index if not exists profiles_id_idx on public.profiles (id);

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- UPDATE needs both clauses: `using` gates which existing rows are visible to
-- the update, `with check` gates what the row is allowed to become. Omitting
-- `with check` would let a user reassign their row's id to someone else.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- Seed a profile row on signup
-- ---------------------------------------------------------------------------
-- Runs as the definer so it can write to public.profiles before the new user
-- has a session. `set search_path = ''` is required on any SECURITY DEFINER
-- function: without it a caller can shadow `public` with their own schema and
-- redirect the insert.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------
-- Required by Google Play "Data safety" and Apple App Privacy for any app that
-- supports account creation.
--
-- The client SDK cannot call auth.admin.deleteUser — that needs the
-- service_role key, which must never be shipped in an app binary. This
-- SECURITY DEFINER function deletes only the caller's own row, and the
-- `on delete cascade` above removes their app data with it.
--
-- `revoke ... from anon` matters: without it an unauthenticated caller can
-- invoke this, and while auth.uid() would be null (deleting nothing), leaving
-- it callable is needless attack surface.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- After applying, confirm RLS is actually on. A table with policies but RLS
-- disabled is wide open, and the dashboard does not shout about it:
--
--   select relname, relrowsecurity from pg_class
--   where relname = 'profiles';   -- relrowsecurity must be true
