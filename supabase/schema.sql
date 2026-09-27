-- Couple time capsule schema
create extension if not exists "pgcrypto";

create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  name text not null default '我们的空间',
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  couple_id uuid not null references couples(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('me', 'baby')),
  created_at timestamptz not null default now()
);

create table if not exists bucket_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  title text not null,
  note text not null default '',
  completed boolean not null default false,
  completed_at date,
  created_at timestamptz not null default now()
);

create table if not exists period_records (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  mood text not null default '',
  symptoms text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  from_role text not null check (from_role in ('me', 'baby')),
  title text not null,
  content text not null,
  mood text not null default '',
  status text not null default 'unread' check (status in ('unread', 'read', 'replied')),
  created_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  person_role text not null check (person_role in ('me', 'baby')),
  city text not null,
  note text not null default '',
  updated_at date not null default current_date
);

create table if not exists travel_checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  city text not null,
  province text not null default '',
  checked_at date not null,
  note text not null default ''
);

create table if not exists music_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  title text not null,
  artist text not null default '',
  link text not null default '',
  reason text not null default '',
  shared_by text not null check (shared_by in ('me', 'baby'))
);

create table if not exists media_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('电影', '剧集', '综艺', '歌曲')),
  status text not null check (status in ('想看', '在看', '已看')),
  rating int not null default 0 check (rating >= 0 and rating <= 5),
  note text not null default ''
);

create table if not exists food_places (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  name text not null,
  city text not null default '',
  address text not null default '',
  dishes text not null default '',
  rating int not null default 5 check (rating >= 1 and rating <= 5),
  revisit boolean not null default true,
  note text not null default ''
);

create table if not exists saving_goals (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  title text not null,
  target numeric(12,2) not null default 0,
  current numeric(12,2) not null default 0,
  note text not null default ''
);

create table if not exists saving_entries (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references saving_goals(id) on delete cascade,
  couple_id uuid not null references couples(id) on delete cascade,
  amount numeric(12,2) not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists moments (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  author_role text not null check (author_role in ('me', 'baby')),
  text text not null,
  place text not null default '',
  image_url text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists anniversaries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  title text not null,
  date date not null,
  note text not null default ''
);

alter table couples enable row level security;
alter table profiles enable row level security;
alter table bucket_items enable row level security;
alter table period_records enable row level security;
alter table messages enable row level security;
alter table locations enable row level security;
alter table travel_checkins enable row level security;
alter table music_items enable row level security;
alter table media_items enable row level security;
alter table food_places enable row level security;
alter table saving_goals enable row level security;
alter table saving_entries enable row level security;
alter table moments enable row level security;
alter table anniversaries enable row level security;

create or replace function public.current_couple_id()
returns uuid
language sql
stable
as $$
  select couple_id from profiles where id = auth.uid()
$$;

create policy "couple read" on couples for select using (id = public.current_couple_id());
create policy "profile read" on profiles for select using (id = auth.uid());
create policy "profile write" on profiles for insert with check (id = auth.uid());

create policy "bucket access" on bucket_items
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "period access" on period_records
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "message access" on messages
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "location access" on locations
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "travel access" on travel_checkins
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "music access" on music_items
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "media access" on media_items
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "food access" on food_places
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "saving goal access" on saving_goals
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "saving entry access" on saving_entries
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "moment access" on moments
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());

create policy "anniversary access" on anniversaries
for all using (couple_id = public.current_couple_id())
with check (couple_id = public.current_couple_id());
