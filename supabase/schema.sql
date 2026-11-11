-- Run this whole file in Supabase > SQL Editor.
create extension if not exists btree_gist;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  role text not null default 'client' check (role in ('client','admin'))
);
create table services (
  id serial primary key,
  name text not null,
  minutes int not null check (minutes > 0),
  price numeric(8,2) not null
);
create table appointments (
  id bigint generated always as identity primary key,
  client_id uuid not null references profiles(id) on delete cascade,
  service_id int not null references services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'Booked' check (status in ('Booked','Completed','Cancelled')),
  paid boolean not null default false,
  notes text not null default '',
  -- the database itself refuses double bookings
  exclude using gist (tstzrange(starts_at, ends_at) with &&) where (status <> 'Cancelled')
);

-- create a profile whenever someone signs up
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create function is_admin() returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- clients can see which times are taken, but not who booked them
create function busy_slots(day_start timestamptz, day_end timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz) language sql security definer set search_path = public stable as $$
  select a.starts_at, a.ends_at from appointments a
  where a.status <> 'Cancelled' and a.starts_at < day_end and a.ends_at > day_start
$$;

alter table profiles enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;

create policy "own profile or admin" on profiles for select using (id = auth.uid() or is_admin());
create policy "anyone signed in can read services" on services for select using (auth.uid() is not null);
create policy "admin manages services" on services for all using (is_admin()) with check (is_admin());
create policy "client reads own bookings" on appointments for select using (client_id = auth.uid() or is_admin());
create policy "client books for self" on appointments for insert with check (client_id = auth.uid() or is_admin());
create policy "client can only cancel own" on appointments for update
  using (client_id = auth.uid() or is_admin())
  with check (is_admin() or (client_id = auth.uid() and status = 'Cancelled'));

insert into services (name, minutes, price) values
  ('Standard service', 30, 40), ('Extended service', 60, 65), ('Quick consultation', 30, 25), ('Premium service', 90, 140);

-- After you sign up in the app, make yourself the owner (change the email):
-- update profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
