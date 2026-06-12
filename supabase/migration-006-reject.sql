-- 拒绝机制：被@的人可以拒绝派来的活；派活人在 @名字 上看到红色 ✕（已拒绝）
-- SQL Editor 整段运行（幂等）
alter table mentions add column if not exists rejected_at timestamptz;

-- 被@的人可以更新自己头上的 mention（用于拒绝）
drop policy if exists mentions_update on mentions;
create policy mentions_update on mentions for update to authenticated
  using (mentioned = auth.uid());
