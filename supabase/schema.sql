-- Kana Kanji SRS: database setup. Paste into the Supabase SQL editor and run it (safe to re-run).
-- The alert job also needs the secret from supabase/setup.local.sql (generated, not in git).

-- One row per account: the whole progress save, plus the review times the alert job reads.
create table if not exists public.progress (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  rev integer not null default 1,              -- bumped on every save; clients only overwrite the rev they read
  due jsonb not null default '[]'::jsonb,      -- [[hour (ms), review count], ...] for the next 30 days
  tz text,                                     -- for quiet hours
  device text,                                 -- which device saved last
  notified_at timestamptz,                     -- last alert sent
  updated_at timestamptz not null default now()
);

-- Phones that turned on review alerts (Web Push subscriptions)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  keys jsonb not null,
  device text,
  created_at timestamptz not null default now()
);

-- Every signed-in account can only see and change its own rows
alter table public.progress enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.progress to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Every 15 minutes, run the notify-reviews function (it sends alerts for newly due reviews)
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('notify-reviews', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://lznraybjpvhbujklkmli.supabase.co/functions/v1/notify-reviews',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')),
    body := '{}'::jsonb
  );
$$);
