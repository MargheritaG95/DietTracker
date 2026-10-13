-- DietTracker: schema del database Supabase
-- Incolla tutto in Supabase > SQL Editor > New query e premi "Run".

-- Piano dieta di ogni utente (uno per utente)
create table if not exists public.plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan jsonb not null,
  updated_at timestamptz not null default now()
);

-- Un record per giorno: pasti segnati, acqua, sport, fuori dieta, bagno
create table if not exists public.days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Pesi, lista della spesa, consenso privacy
create table if not exists public.misc (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Contatore giornaliero delle richieste a Claude (lo scrive solo la funzione server)
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  parse_count int not null default 0,
  eval_count int not null default 0,
  primary key (user_id, day)
);

-- Sicurezza: ogni utente vede e modifica solo i propri dati
alter table public.plans enable row level security;
alter table public.days enable row level security;
alter table public.misc enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "own plan" on public.plans;
create policy "own plan" on public.plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own days" on public.days;
create policy "own days" on public.days for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own misc" on public.misc;
create policy "own misc" on public.misc for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read own usage" on public.ai_usage;
create policy "read own usage" on public.ai_usage for select
  using (auth.uid() = user_id);
-- (nessuna policy di scrittura su ai_usage: la aggiorna solo la funzione con la chiave di servizio)
