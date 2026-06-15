-- 019：文档版本历史（防数据丢失的最强一条）。
-- 每次 docs 行被更新、且 doc_json 真的变了时，先把"旧版"快照进 doc_revisions。
-- 这样任何覆盖 / 误删 / bug 空存，都能回滚到任意历史版本——把"数据丢失"变成"恢复一个版本"。
-- 关键：用 DB 触发器（服务端），比客户端存快照更稳——SQL 直改、客户端 bug、任何路径的写入都拦得住。
-- Supabase 控制台 → SQL Editor 整段跑（幂等）。

create table if not exists doc_revisions (
  id          bigint generated always as identity primary key,
  doc_id      uuid not null references docs(id) on delete cascade,
  owner       uuid not null,
  section     text not null,
  period_key  text not null,
  doc_json    jsonb,
  doc_text    text,
  -- 这一版"是什么时候被覆盖掉的"（= 旧行的 updated_at）
  saved_at    timestamptz not null default now()
);

create index if not exists doc_revisions_doc_idx on doc_revisions (doc_id, saved_at desc);

-- 覆盖前快照旧版（只在 doc_json 真变化时；每篇只留最近 50 版，防膨胀）。
create or replace function snapshot_doc_revision() returns trigger
language plpgsql security definer as $$
begin
  if old.doc_json is distinct from new.doc_json then
    insert into doc_revisions (doc_id, owner, section, period_key, doc_json, doc_text, saved_at)
    values (old.id, old.owner, old.section, old.period_key, old.doc_json, old.doc_text, old.updated_at);

    delete from doc_revisions
    where doc_id = old.id
      and id not in (
        select id from doc_revisions where doc_id = old.id order by saved_at desc limit 50
      );
  end if;
  return new;
end $$;

drop trigger if exists trg_snapshot_doc_revision on docs;
create trigger trg_snapshot_doc_revision
  before update on docs
  for each row execute function snapshot_doc_revision();

-- RLS：和 docs 一致——团队内活跃成员可读自己/团队的修订历史。
alter table doc_revisions enable row level security;
drop policy if exists doc_revisions_read on doc_revisions;
create policy doc_revisions_read on doc_revisions for select
  using (exists (select 1 from profiles me where me.id = auth.uid() and me.status = 'active'));

-- 用法：
--   看某篇的历史：select id, length(doc_text), saved_at from doc_revisions
--                 where doc_id = '<docId>' order by saved_at desc;
--   恢复某一版：update docs set doc_json = r.doc_json, doc_text = r.doc_text
--               from doc_revisions r where r.id = <revisionId> and docs.id = r.doc_id;
