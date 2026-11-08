-- Cloud account data for the web app (see web/src/lib/cloud-account.ts).
-- One row per user, holding only the already encrypted design/prefs blob – the database and the PC cannot read it.
-- Row Level Security: every signed-in user reaches exactly their own row, nobody else's and no anonymous access.

create table if not exists public.account_blobs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  blob text not null check (char_length(blob) between 1 and 1000000),
  updated_at timestamptz not null default now()
);

alter table public.account_blobs enable row level security;

revoke all on public.account_blobs from anon;
grant select, insert, update, delete on public.account_blobs to authenticated;

drop policy if exists "account_blobs: read own" on public.account_blobs;
create policy "account_blobs: read own" on public.account_blobs
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "account_blobs: insert own" on public.account_blobs;
create policy "account_blobs: insert own" on public.account_blobs
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "account_blobs: update own" on public.account_blobs;
create policy "account_blobs: update own" on public.account_blobs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "account_blobs: delete own" on public.account_blobs;
create policy "account_blobs: delete own" on public.account_blobs
  for delete to authenticated using (auth.uid() = user_id);
