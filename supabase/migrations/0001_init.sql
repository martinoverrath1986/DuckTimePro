-- DuckTime Pro – Schema für Arbeitgeber, Einträge, Settings.
-- Jede Zeile gehört einem user_id (= auth.uid()), RLS sorgt dafür, dass jeder
-- Nutzer ausschließlich seine eigenen Daten sieht/ändert.

create extension if not exists pgcrypto;

create table public.employers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text,
  wage_type text not null check (wage_type in ('hourly','salary')),
  wage numeric(10,2) default 0,
  monthly_salary numeric(10,2) default 0,
  weekly_target_hours numeric(5,2) default 40,
  vacation_days_per_year numeric(5,2) default 20,
  is_minijob boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('work','vacation','sick')),
  employer_id uuid references public.employers(id) on delete set null,
  date date not null,
  start_time text,
  end_time text,
  break_minutes integer default 0,
  duration text check (duration in ('full','half')),
  note text,
  snapshot jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  minijob_limit numeric(10,2) not null default 603,
  updated_at timestamptz not null default now()
);

create index entries_user_updated_idx on public.entries (user_id, updated_at);
create index employers_user_updated_idx on public.employers (user_id, updated_at);

-- updated_at wird IMMER server-seitig gesetzt (nicht vom Client) – macht die
-- spätere Sync-Konfliktlösung (Last-Write-Wins) unabhängig von falsch
-- eingestellten Geräte-Uhren.
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

create trigger trg_employers_touch before insert or update on public.employers
  for each row execute function public.touch_updated_at();
create trigger trg_entries_touch before insert or update on public.entries
  for each row execute function public.touch_updated_at();
create trigger trg_settings_touch before insert or update on public.settings
  for each row execute function public.touch_updated_at();

alter table public.employers enable row level security;
alter table public.entries enable row level security;
alter table public.settings enable row level security;

create policy "employers_owner" on public.employers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "entries_owner" on public.entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "settings_owner" on public.settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
