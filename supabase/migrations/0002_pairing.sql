-- PIN-Kopplung: Ein Gerät erzeugt einen kurzlebigen 6-stelligen Code, ein
-- zweites Gerät löst ihn ein und bekommt dadurch dieselbe Identität (auth.uid())
-- wie das erste Gerät zugewiesen. Nur die Edge Functions (Service-Role) dürfen
-- auf diese Tabelle zugreifen – kein RLS-Policy für anon/authenticated, damit
-- niemand über die normale REST-API fremde Codes lesen oder raten kann.

create table public.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts integer not null default 0
);

create unique index pairing_codes_active_code_idx on public.pairing_codes (code) where used_at is null;

alter table public.pairing_codes enable row level security;
-- Bewusst KEINE Policies für anon/authenticated – nur der Service-Role-Key
-- (ausschließlich serverseitig in den Edge Functions) darf diese Tabelle anfassen.
