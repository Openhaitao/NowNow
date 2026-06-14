-- 016：@提及 = 轻量「派活 → 完成」闭环（Haitao）。
-- 被@人在通知里勾完成 → 该通知从他收件箱消失；发起人(author)收到黄色「对方已完成」通知，可点掉。
-- additive：doc_mentions 加两列 + 两个 RPC。SQL Editor 整段运行（幂等）。
-- 注：无需改 RLS —— author = doc.owner，现有 select 策略已允许 author 读自己派的提及。

alter table doc_mentions add column if not exists completed_at       timestamptz; -- 被@人点完成的时间
alter table doc_mentions add column if not exists completion_seen_at timestamptz; -- 作者看过/点掉黄色通知的时间

-- 被@本人勾「完成」（只能勾自己收到、且未完成的那条）
create or replace function complete_mention(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update doc_mentions set completed_at = now()
  where id = p_id and mentioned = auth.uid() and completed_at is null;
end $$;

-- 作者点掉黄色「X 已完成」通知（只能点自己派的、已完成、未点过的那条）
create or replace function ack_completion(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update doc_mentions set completion_seen_at = now()
  where id = p_id and author = auth.uid() and completed_at is not null and completion_seen_at is null;
end $$;
