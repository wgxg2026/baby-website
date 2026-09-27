create table if not exists public.shared_app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.shared_app_state enable row level security;

drop policy if exists "public shared state read" on public.shared_app_state;
drop policy if exists "public shared state write" on public.shared_app_state;

create policy "public shared state read"
on public.shared_app_state
for select
to anon
using (true);

create policy "public shared state write"
on public.shared_app_state
for all
to anon
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.shared_app_state;
exception
  when duplicate_object then null;
end
$$;

insert into storage.buckets (id, name, public)
values ('moments', 'moments', true)
on conflict (id) do update set public = true;

drop policy if exists "public moments read" on storage.objects;
drop policy if exists "public moments upload" on storage.objects;
drop policy if exists "public moments delete" on storage.objects;

create policy "public moments read"
on storage.objects
for select
to anon
using (bucket_id = 'moments');

create policy "public moments upload"
on storage.objects
for insert
to anon
with check (bucket_id = 'moments');

create policy "public moments delete"
on storage.objects
for delete
to anon
using (bucket_id = 'moments');
