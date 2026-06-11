-- NowNow schema · 整个系统就这一份需要想清楚的东西
-- 在 Supabase 控制台 → SQL Editor 里整段粘贴运行（幂等：可重复跑）
--
-- 模型：一切都是条目(entries)。@人产生 mentions（收件箱）。
-- 完成流：自己的目标 open→closed；@别人的：对方认领(复制)→对方 resolve→原条目回到创建者→只有创建者能 close。

-- ============ 表 ============

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       text unique not null,          -- @用的名字，如 haitao
  display_name text not null,                 -- 显示名，如 海涛
  created_at   timestamptz not null default now()
);

create table if not exists entries (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references profiles(id),  -- 在谁的页面上
  creator      uuid not null references profiles(id),  -- 谁创建的（关闭权归他）
  section      text not null check (section in ('today','week','month')),
  content      text not null default '',
  is_goal      boolean not null default false,         -- true=带完成框的目标，false=备忘
  status       text not null default 'open' check (status in ('open','resolved','closed')),
  is_private   boolean not null default false,
  source_entry uuid references entries(id) on delete set null, -- 认领来的：指回原条目
  position     double precision not null default 0,    -- 区内自由排序
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists mentions (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references entries(id) on delete cascade,
  mentioned     uuid not null references profiles(id),
  claimed_entry uuid references entries(id) on delete set null, -- 认领后指向复制出的新条目
  created_at    timestamptz not null default now(),
  unique (entry_id, mentioned)
);

create index if not exists entries_owner_idx   on entries (owner, section, position);
create index if not exists mentions_inbox_idx  on mentions (mentioned) where claimed_entry is null;

-- updated_at 自动维护
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists entries_touch on entries;
create trigger entries_touch before update on entries
  for each row execute function touch_updated_at();

-- ============ RLS：规则焊在数据库层，前端只是显示 ============

alter table profiles enable row level security;
alter table entries  enable row level security;
alter table mentions enable row level security;

-- profiles：登录用户互相可见；只能建/改自己的
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (true);
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated using (id = auth.uid());

-- entries：公开条目全员可见；私密只有 owner/creator 看得到
drop policy if exists entries_select on entries;
create policy entries_select on entries for select to authenticated
  using (not is_private or owner = auth.uid() or creator = auth.uid());

-- 只能往自己页面建自己的条目（认领的复制也是这个形态）
drop policy if exists entries_insert on entries;
create policy entries_insert on entries for insert to authenticated
  with check (owner = auth.uid() and creator = auth.uid());

-- 只有 owner 能改自己页面的条目；status 改成 closed 必须是 creator（=唯一的关闭权规则）
drop policy if exists entries_update on entries;
create policy entries_update on entries for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and (status <> 'closed' or creator = auth.uid()));

drop policy if exists entries_delete on entries;
create policy entries_delete on entries for delete to authenticated
  using (owner = auth.uid() and creator = auth.uid());

-- mentions：被@的人和条目创建者可见；创建者建；认领由函数处理
drop policy if exists mentions_select on mentions;
create policy mentions_select on mentions for select to authenticated
  using (mentioned = auth.uid()
         or exists (select 1 from entries e where e.id = entry_id and e.creator = auth.uid()));
drop policy if exists mentions_insert on mentions;
create policy mentions_insert on mentions for insert to authenticated
  with check (exists (select 1 from entries e where e.id = entry_id and e.creator = auth.uid()));
drop policy if exists mentions_delete on mentions;
create policy mentions_delete on mentions for delete to authenticated
  using (exists (select 1 from entries e where e.id = entry_id and e.creator = auth.uid()));

-- ============ 两个跨权限动作：用 security definer 函数收口 ============
-- RLS 管不了"别人改我条目的一个字段"，这两个动作单独开门、门内自己验身份。

-- 认领：把@我的条目复制到我自己的某个区，并登记 claimed_entry
create or replace function claim_mention(p_mention_id uuid, p_section text default 'today')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m mentions%rowtype;
  src entries%rowtype;
  new_id uuid;
begin
  select * into m from mentions where id = p_mention_id and mentioned = auth.uid();
  if not found then raise exception 'not your mention'; end if;
  if m.claimed_entry is not null then return m.claimed_entry; end if;
  select * into src from entries where id = m.entry_id;
  insert into entries (owner, creator, section, content, is_goal, source_entry, position)
  values (auth.uid(), auth.uid(), p_section, src.content, src.is_goal, src.id,
          coalesce((select min(position) from entries where owner = auth.uid() and section = p_section), 0) - 1)
  returning id into new_id;
  update mentions set claimed_entry = new_id where id = p_mention_id;
  return new_id;
end $$;

-- 已解决：被@的人把"原条目"标成 resolved（球回创建者，等他 close）
create or replace function resolve_entry(p_entry_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from mentions where entry_id = p_entry_id and mentioned = auth.uid()) then
    raise exception 'not mentioned on this entry';
  end if;
  update entries set status = 'resolved' where id = p_entry_id and status = 'open';
end $$;

-- ============ Realtime ============
do $$ begin
  alter publication supabase_realtime add table entries;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table mentions;
exception when duplicate_object then null; end $$;
