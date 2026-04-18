-- 啟用需要的 extension
create extension if not exists pgcrypto;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Workspaces
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Workspace members
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

-- Workspace settings
create table if not exists public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  opening_cash numeric(12,2) not null default 0,
  opening_bank numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- Transactions
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  date date not null,
  type text not null check (type in ('income', 'expense', 'transfer')),
  account text not null check (account in ('cash', 'bank', 'cash_to_bank', 'bank_to_cash')),
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_workspace_date_idx on public.transactions(workspace_id, date desc);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists workspace_members_workspace_idx on public.workspace_members(workspace_id);

-- 自動建立 profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 更新 updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists transactions_touch_updated_at on public.transactions;
create trigger transactions_touch_updated_at
before update on public.transactions
for each row execute procedure public.touch_updated_at();

-- 邀請碼產生器
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  output text := '';
  i integer := 0;
  candidate text;
begin
  loop
    output := '';
    for i in 1..8 loop
      output := output || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    candidate := output;
    exit when not exists (
      select 1 from public.workspaces where invite_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

-- 建立工作區 + owner membership + 預設 settings
create or replace function public.create_workspace_with_owner(workspace_name_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.workspaces (name, invite_code, owner_user_id)
  values (workspace_name_input, public.generate_invite_code(), uid)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, uid, 'owner');

  insert into public.workspace_settings (workspace_id, opening_cash, opening_bank)
  values (new_workspace_id, 0, 0);

  return new_workspace_id;
end;
$$;

-- 用邀請碼加入工作區
create or replace function public.join_workspace_by_code(invite_code_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select id into target_workspace_id
  from public.workspaces
  where invite_code = upper(invite_code_input);

  if target_workspace_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_workspace_id, uid, 'member')
  on conflict (workspace_id, user_id) do nothing;

  return target_workspace_id;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.transactions enable row level security;

-- profiles
drop policy if exists "profiles can view self" on public.profiles;
create policy "profiles can view self"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles can update self" on public.profiles;
create policy "profiles can update self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- workspaces
drop policy if exists "workspace members can read workspaces" on public.workspaces;
create policy "workspace members can read workspaces"
on public.workspaces
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
  )
);

-- workspace_members
drop policy if exists "users can read their memberships" on public.workspace_members;
create policy "users can read their memberships"
on public.workspace_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can read members in their workspaces" on public.workspace_members;
create policy "users can read members in their workspaces"
on public.workspace_members
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members mine
    where mine.workspace_id = workspace_members.workspace_id
      and mine.user_id = auth.uid()
  )
);

-- workspace_settings
drop policy if exists "workspace members can read settings" on public.workspace_settings;
create policy "workspace members can read settings"
on public.workspace_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_settings.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can update settings" on public.workspace_settings;
create policy "workspace members can update settings"
on public.workspace_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_settings.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_settings.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- transactions
drop policy if exists "workspace members can read transactions" on public.transactions;
create policy "workspace members can read transactions"
on public.transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = transactions.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can insert transactions" on public.transactions;
create policy "workspace members can insert transactions"
on public.transactions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = transactions.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can update transactions" on public.transactions;
create policy "workspace members can update transactions"
on public.transactions
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = transactions.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = transactions.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can delete transactions" on public.transactions;
create policy "workspace members can delete transactions"
on public.transactions
for delete
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = transactions.workspace_id
      and wm.user_id = auth.uid()
  )
);
