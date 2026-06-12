-- 固定邀请链接 + 邀请人确认（Slack 入群模型）
-- SQL Editor 整段运行（幂等）。语义变化：
--   · 每人一条长期有效的邀请链接（可作废重生成），随便转发
--   · 点链接的人登录起名后进入"待确认"状态，看不到任何数据
--   · 谁的链接谁确认：邀请人在通知页 通过/拒绝

alter table profiles add column if not exists status text not null default 'active'
  check (status in ('pending', 'active'));
alter table profiles add column if not exists invited_with uuid;

alter table invites add column if not exists revoked boolean not null default false;

-- 兑换：固定链接不再一次性；创建"待确认"的 profile
create or replace function redeem_invite(p_token uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype;
begin
  if exists (select 1 from profiles where id = auth.uid()) then return; end if;
  select * into inv from invites where token = p_token and revoked = false;
  if not found then raise exception '邀请链接无效或已作废'; end if;
  if p_name is null or trim(p_name) = '' then raise exception '名字不能为空'; end if;
  insert into profiles (id, handle, display_name, status, invited_with)
  values (auth.uid(), lower(trim(p_name)), trim(p_name), 'pending', p_token);
end $$;

-- 确认/拒绝：只有这条邀请的创建者能操作
create or replace function approve_member(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from profiles t join invites i on i.token = t.invited_with
    where t.id = p_id and t.status = 'pending' and i.created_by = auth.uid()
  ) then raise exception '只有邀请人能确认这位成员'; end if;
  update profiles set status = 'active' where id = p_id;
end $$;

create or replace function reject_member(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from profiles t join invites i on i.token = t.invited_with
    where t.id = p_id and t.status = 'pending' and i.created_by = auth.uid()
  ) then raise exception '只有邀请人能处理这位成员'; end if;
  delete from profiles where id = p_id and status = 'pending';
end $$;

-- 数据大门：只有 active 成员能读写数据
drop policy if exists entries_select on entries;
create policy entries_select on entries for select to authenticated
  using (exists (select 1 from profiles me where me.id = auth.uid() and me.status = 'active')
         and (not is_private or owner = auth.uid() or creator = auth.uid()));
drop policy if exists entries_insert on entries;
create policy entries_insert on entries for insert to authenticated
  with check (owner = auth.uid() and creator = auth.uid()
              and exists (select 1 from profiles me where me.id = auth.uid() and me.status = 'active'));

drop policy if exists invites_insert on invites;
create policy invites_insert on invites for insert to authenticated
  with check (created_by = auth.uid()
              and exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'active'));
drop policy if exists invites_update on invites;
create policy invites_update on invites for update to authenticated
  using (created_by = auth.uid());

-- 老用户全部标 active（默认值已是 active，保险起见）
update profiles set status = 'active' where status is null;
