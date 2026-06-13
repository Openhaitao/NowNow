-- 009：文档化内核（Tiptap / ProseMirror）—— 新表 docs
-- 模型升级：纸 = 一份完整 markdown 文档。一份文档 = 一个 (owner × section × period 实例)。
--   section ∈ today/week/month/stash（4 个并列书写桶，沿用 entries 的语义）。
--   period_key = 周期实例：天 '2026-06-13' / ISO 周 '2026-W24'(周一起，对齐前端 periodRange) / 月 '2026-06' / 暂存箱无周期固定 'stash'。
-- 文档真源现在 = doc_json（ProseMirror JSON）；doc_text = 纯文本投影（喂搜索 / RLS / @ 提取）。
-- ystate（可空）= 预留 Yjs：将来加多人协作时真源换成 Y.Doc 二进制，doc_json/doc_text 退化为派生投影，纯填值、不迁移存量行。
-- DO 房间键约定（协作阶段路由用，不入库）：`${owner}:${section}:${period_key}`。
-- 旧的逐行 is_private 在文档模型里没了；整页 / 分块隐私留 P2。先全团队可读（和"能看别人主页"一致）。
-- SQL Editor 整段运行（幂等，可重复跑）。

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

-- updated_at 自动维护（复用 schema.sql 的 touch_updated_at）
drop trigger if exists docs_touch on docs;
create trigger docs_touch before update on docs
  for each row execute function touch_updated_at();

-- ============ RLS ============
alter table docs enable row level security;

-- 团队可见：登录用户都能读（和"能看别人主页"一致）
drop policy if exists docs_select on docs;
create policy docs_select on docs for select to authenticated using (true);

-- 只能写自己的文档
drop policy if exists docs_insert on docs;
create policy docs_insert on docs for insert to authenticated with check (owner = auth.uid());
drop policy if exists docs_update on docs;
create policy docs_update on docs for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists docs_delete on docs;
create policy docs_delete on docs for delete to authenticated using (owner = auth.uid());

-- ============ Realtime（协作前也有用：实时看别人页面更新） ============
do $$ begin
  alter publication supabase_realtime add table docs;
exception when duplicate_object then null; end $$;
