-- 011：doc_mentions —— docs 世界的 @通知索引（additive，不碰旧 mentions/entries）
-- docs 世界 @某人 = 纯通知（无认领/已解决任务流）。保存文档时客户端 syncDocMentions 同步：
--   从 doc 的 mention 节点取被@的人 → 每人 upsert 一行、删掉文里已没有的（旧 syncMentions 换 entry_id→doc_id）。
-- 收件箱「@我的」= where mentioned = me；read_at 标已读。
-- cutover 删旧 entries/mentions 时，这张表接棒通知链。
-- Supabase 控制台 → SQL Editor 整段运行（幂等，可重复跑）。

create table if not exists doc_mentions (
  id          uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references docs(id) on delete cascade,
  mentioned   uuid not null references profiles(id) on delete cascade,   -- 被@的人
  author      uuid not null references profiles(id),                     -- 写的人(=doc.owner；存着省 join)
  created_at  timestamptz not null default now(),
  read_at     timestamptz,                                               -- null=未读（收件箱）
  unique (doc_id, mentioned)
);

create index if not exists doc_mentions_inbox_idx on doc_mentions (mentioned) where read_at is null;

alter table doc_mentions enable row level security;

-- 被@的人 + 文档 owner 可读
drop policy if exists doc_mentions_select on doc_mentions;
create policy doc_mentions_select on doc_mentions for select to authenticated
  using (mentioned = auth.uid()
         or exists (select 1 from docs d where d.id = doc_id and d.owner = auth.uid()));

-- 只有文档 owner 能建/删（保存自己文档时同步 @）
drop policy if exists doc_mentions_insert on doc_mentions;
create policy doc_mentions_insert on doc_mentions for insert to authenticated
  with check (exists (select 1 from docs d where d.id = doc_id and d.owner = auth.uid()));
drop policy if exists doc_mentions_delete on doc_mentions;
create policy doc_mentions_delete on doc_mentions for delete to authenticated
  using (exists (select 1 from docs d where d.id = doc_id and d.owner = auth.uid()));

-- 被@的人能标自己那条已读（mark read）
drop policy if exists doc_mentions_update on doc_mentions;
create policy doc_mentions_update on doc_mentions for update to authenticated
  using (mentioned = auth.uid()) with check (mentioned = auth.uid());

-- Realtime：被@时收件箱实时亮
do $$ begin
  alter publication supabase_realtime add table doc_mentions;
exception when duplicate_object then null; end $$;
