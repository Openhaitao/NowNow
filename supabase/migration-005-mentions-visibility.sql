-- 全部目标页要展示"这活谁派的、认领没、解决没"——@关系对全员可见（本来就是默认公开的产品）
-- SQL Editor 整段运行（幂等）
drop policy if exists mentions_select on mentions;
create policy mentions_select on mentions for select to authenticated
  using (exists (select 1 from profiles me where me.id = auth.uid() and me.status = 'active'));
