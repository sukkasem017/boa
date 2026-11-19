-- ============================================================
-- LabQ : โครงสร้างฐานข้อมูล Supabase (PostgreSQL)
-- วิธีใช้: Supabase Dashboard > SQL Editor > วางทั้งไฟล์นี้ > Run
-- จากนั้นรัน seed.sql เพื่อใส่ข้อมูลตัวอย่าง
-- ============================================================

create extension if not exists btree_gist;

-- ---------- ตาราง ----------
create table if not exists public.resources (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('room','equipment')),
  name         text not null,
  description  text,
  location     text,
  capacity     int,                       -- ห้อง: จำนวนที่นั่ง
  stock_total  int  not null default 1,   -- อุปกรณ์: จำนวนทั้งหมด
  max_hours    int  not null default 3,   -- ห้อง: จองได้ครั้งละกี่ชั่วโมง
  max_days     int  not null default 3,   -- อุปกรณ์: ยืมได้กี่วัน
  rules        text[] not null default '{}',
  icon         text not null default '🔬',
  popular      boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.requests (
  id               uuid primary key default gen_random_uuid(),
  resource_id      uuid not null references public.resources(id) on delete cascade,
  kind             text not null check (kind in ('room','equipment')),
  student_id       text not null check (student_id ~ '^[0-9]{8,10}$'),
  student_name     text not null check (char_length(student_name) between 3 and 120),
  phone            text check (phone ~ '^0[0-9]{8,9}$'),
  purpose          text not null check (char_length(purpose) between 10 and 500),
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  quantity         int  not null default 1 check (quantity > 0),
  status           text not null default 'pending'
                   check (status in ('pending','approved','in_use','returned','rejected','cancelled')),
  return_reported  boolean not null default false,
  admin_note       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists requests_student_idx  on public.requests (student_id, created_at desc);
create index if not exists requests_resource_idx on public.requests (resource_id, start_at, end_at);

-- ป้องกันการจองห้องซ้อนเวลา (กันที่ระดับฐานข้อมูล แม้มีคนกดพร้อมกัน)
alter table public.requests drop constraint if exists no_room_overlap;
alter table public.requests add constraint no_room_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (kind = 'room' and status in ('pending','approved','in_use'));

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- ฟังก์ชันช่วย ----------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- มุมมองสาธารณะ: เห็นเฉพาะช่วงเวลาที่ถูกจอง (ไม่เห็นชื่อ/รหัสนักศึกษา)
create or replace view public.public_bookings as
  select resource_id, kind, start_at, end_at, quantity, status
  from public.requests
  where status in ('pending','approved','in_use');

-- ส่งคำขอจอง/ยืม (ตรวจกติกาฝั่งเซิร์ฟเวอร์อีกชั้น)
create or replace function public.create_request(
  p_resource uuid, p_student_id text, p_name text, p_phone text,
  p_purpose text, p_start timestamptz, p_end timestamptz, p_qty int
) returns public.requests
language plpgsql security definer set search_path = public as $$
declare
  r   public.resources;
  used int;
  v_qty int := coalesce(p_qty, 1);
  rec public.requests;
begin
  select * into r from public.resources where id = p_resource and active;
  if not found then
    raise exception 'ไม่พบรายการที่เลือก' using errcode = 'P0002';
  end if;
  if p_start < now() - interval '1 hour' then
    raise exception 'ไม่สามารถจองย้อนหลังได้' using errcode = 'P0001';
  end if;

  if r.kind = 'room' then
    v_qty := 1;
    if p_end - p_start > make_interval(hours => r.max_hours) then
      raise exception 'จองห้องนี้ได้ครั้งละไม่เกิน % ชั่วโมง', r.max_hours using errcode = 'P0001';
    end if;
  else
    if p_end - p_start > make_interval(days => r.max_days) then
      raise exception 'ยืมอุปกรณ์นี้ได้ไม่เกิน % วัน', r.max_days using errcode = 'P0001';
    end if;
    select coalesce(sum(quantity), 0) into used
      from public.requests
     where resource_id = p_resource
       and status in ('pending','approved','in_use')
       and tstzrange(start_at, end_at) && tstzrange(p_start, p_end);
    if used + v_qty > r.stock_total then
      raise exception 'จำนวนคงเหลือไม่พอ (เหลือ % ชิ้น)', greatest(r.stock_total - used, 0) using errcode = 'P0001';
    end if;
  end if;

  insert into public.requests
    (resource_id, kind, student_id, student_name, phone, purpose, start_at, end_at, quantity)
  values
    (p_resource, r.kind, p_student_id, trim(p_name), nullif(p_phone,''), trim(p_purpose), p_start, p_end, v_qty)
  returning * into rec;
  return rec;
end $$;

-- ดูคำขอของตัวเอง (ด้วยรหัสนักศึกษา)
create or replace function public.my_requests(p_student_id text)
returns setof public.requests
language sql security definer stable set search_path = public as $$
  select * from public.requests where student_id = p_student_id order by created_at desc;
$$;

-- นักศึกษายกเลิกคำขอ / แจ้งคืน
create or replace function public.student_action(p_id uuid, p_student_id text, p_action text)
returns public.requests
language plpgsql security definer set search_path = public as $$
declare rec public.requests;
begin
  select * into rec from public.requests where id = p_id and student_id = p_student_id for update;
  if not found then
    raise exception 'ไม่พบคำขอนี้' using errcode = 'P0002';
  end if;

  if p_action = 'cancel' then
    if rec.status not in ('pending','approved') then
      raise exception 'คำขอนี้ยกเลิกไม่ได้แล้ว' using errcode = 'P0001';
    end if;
    update public.requests set status = 'cancelled', updated_at = now()
     where id = p_id returning * into rec;
  elsif p_action = 'report_return' then
    if rec.status <> 'in_use' then
      raise exception 'ยังไม่อยู่ในสถานะกำลังใช้งาน' using errcode = 'P0001';
    end if;
    update public.requests set return_reported = true, updated_at = now()
     where id = p_id returning * into rec;
  else
    raise exception 'คำสั่งไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  return rec;
end $$;

-- ---------- สิทธิ์และ Row Level Security ----------
alter table public.resources enable row level security;
alter table public.requests  enable row level security;
alter table public.admins    enable row level security;

revoke all on public.requests from anon;
revoke all on public.admins   from anon;

drop policy if exists "resources_read"   on public.resources;
drop policy if exists "resources_admin"  on public.resources;
create policy "resources_read"  on public.resources for select to anon, authenticated using (active or public.is_admin());
create policy "resources_admin" on public.resources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "requests_admin_select" on public.requests;
drop policy if exists "requests_admin_update" on public.requests;
drop policy if exists "requests_admin_delete" on public.requests;
create policy "requests_admin_select" on public.requests for select to authenticated using (public.is_admin());
create policy "requests_admin_update" on public.requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "requests_admin_delete" on public.requests for delete to authenticated using (public.is_admin());

drop policy if exists "admins_self" on public.admins;
create policy "admins_self" on public.admins for select to authenticated using (user_id = auth.uid());

revoke all on function public.create_request(uuid,text,text,text,text,timestamptz,timestamptz,int) from public;
revoke all on function public.my_requests(text) from public;
revoke all on function public.student_action(uuid,text,text) from public;
grant execute on function public.create_request(uuid,text,text,text,text,timestamptz,timestamptz,int) to anon, authenticated;
grant execute on function public.my_requests(text) to anon, authenticated;
grant execute on function public.student_action(uuid,text,text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant select on public.public_bookings to anon, authenticated;

-- ---------- สร้างผู้ดูแล (ทำหลังสร้างผู้ใช้ใน Authentication > Users) ----------
-- insert into public.admins (user_id)
--   select id from auth.users where email = 'admin@your-school.ac.th';
