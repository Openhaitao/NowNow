-- 009：新增文档模型存储 docs（先加表，不删旧 entries——见文末时序）
-- 模型：纸 = 完整 markdown 文档。一份文档 = 一个 (owner × section × period 实例)。
--   section ∈ today/week/month/stash（4 个并列书写桶）。
--   period_key：天 '2026-06-13' / ISO 周 '2026-W24'(周一起，对齐前端 periodRange) / 月 '2026-06' / 暂存箱 'stash'。
-- doc_json(ProseMirror JSON，当前真源) + doc_text(纯文本投影，喂搜索/@提取) + ystate bytea(可空，预留 Yjs)。
-- DO 房间键约定（协作阶段路由用，不入库）：`${owner}:${section}:${period_key}`。
-- 隐私先全团队可读（逐行 is_private 文档模型里没了；整页/分块隐私 P2）。
-- ⚠️ 时序：现在只「加」docs，不删 entries——线上 textarea 版还在读 entries，删了当场坏。
--    等文档版切上 production，再用 migration-010 删 entries/mentions + 两个目标 RPC，彻底清干净。
-- Supabase 控制台 → SQL Editor 整段运行（幂等，可重复跑）。

-- updated_at 触发器函数（自包含：已有则覆盖）
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists docs (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references profiles(id) on delete cascade,
  section     text not null check (section in ('today','week','month','stash')),
  period_key  text not null,                                                  -- '2026-06-13' / '2026-W24' / '2026-06' / 'stash'
  doc_json    jsonb not null default '{"type":"doc","content":[]}'::jsonb,    -- ProseMirror JSON（当前真源）
  doc_text    text  not null default '',                                      -- 纯文本投影：搜索 + 行内 @ 提取
  ystate      bytea,                                                          -- 预留 Yjs 二进制（协作上线后启用，现可空）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner, section, period_key)                                         -- 一个 (人 × 桶 × 周期) 唯一一篇
);

create index if not exists docs_owner_idx on docs (owner, section, period_key);

drop trigger if exists docs_touch on docs;
create trigger docs_touch before update on docs
  for each row execute function touch_updated_at();

-- RLS：团队可见（authenticated 全可读），写仅 owner
alter table docs enable row level security;
drop policy if exists docs_select on docs;
create policy docs_select on docs for select to authenticated using (true);
drop policy if exists docs_insert on docs;
create policy docs_insert on docs for insert to authenticated with check (owner = auth.uid());
drop policy if exists docs_update on docs;
create policy docs_update on docs for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists docs_delete on docs;
create policy docs_delete on docs for delete to authenticated using (owner = auth.uid());

-- Realtime（实时看别人页面更新）
do $$ begin
  alter publication supabase_realtime add table docs;
exception when duplicate_object then null; end $$;
