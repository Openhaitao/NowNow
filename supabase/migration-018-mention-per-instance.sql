-- 018：@提及改成「每个 @ 实例一条」（Haitao）——一篇里 @ 同一人多次/不同任务，各自一条通知、各自能勾完成。
-- 唯一键从 (doc_id, mentioned) 换成 mention_id（= 编辑器 mention 节点的 mid）。SQL Editor 整段跑（幂等）。

alter table doc_mentions add column if not exists mention_id text;

-- 老行 backfill 一个 uuid（让它们有合法 mention_id，满足新唯一键 + not null）
update doc_mentions set mention_id = gen_random_uuid()::text where mention_id is null;

-- 去掉旧的 (doc_id, mentioned) 唯一约束（按定义查找，名字稳妥）
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.doc_mentions'::regclass and contype = 'u'
  loop
    if pg_get_constraintdef(
         (select oid from pg_constraint where conname = c and conrelid = 'public.doc_mentions'::regclass)
       ) ilike '%(doc_id, mentioned)%' then
      execute format('alter table doc_mentions drop constraint %I', c);
    end if;
  end loop;
end $$;

-- 新唯一键：mention_id
alter table doc_mentions add constraint doc_mentions_mention_id_key unique (mention_id);
alter table doc_mentions alter column mention_id set not null;
