-- 邀请制：设置里生成邀请链接，对方点链接→输邮箱收登录链接→起名即进，无需手动加白名单
-- SQL Editor 整段运行（幂等）。跑完后去 Authentication → Sign In/Up 把
-- "Allow new users to sign up" 重新打开（真正的门挪到了 profile 层：没邀请进不来任何数据）。

create table if not exists invites (
  token      uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  used_by    uuid references profiles(id),
  used_at    timestamptz
);

alter table invites enable row level security;
drop policy if exists invites_select on invites;
create policy invites_select on invites for select to authenticated
  using (created_by = auth.uid());
drop policy if exists invites_insert on invites;
create policy invites_insert on invites for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from profiles p where p.id = auth.uid()));

-- 兑换邀请：验 token → 建 profile → 标记已用（一次性）
create or replace function redeem_invite(p_token uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype;
begin
  if exists (select 1 from profiles where id = auth.uid()) then return; end if;
  select * into inv from invites where token = p_token and used_by is null;
  if not found then raise exception '邀请链接无效或已被使用'; end if;
  if p_name is null or trim(p_name) = '' then raise exception '名字不能为空'; end if;
  insert into profiles (id, handle, display_name) values (auth.uid(), lower(trim(p_name)), trim(p_name));
  update invites set used_by = auth.uid(), used_at = now() where token = p_token;
end $$;

-- 收紧大门：没有 profile 的登录账号一条数据都看不到；新 profile 只能经 redeem_invite 创建
drop policy if exists entries_select on entries;
create policy entries_select on entries for select to authenticated
  using (exists (select 1 from profiles me where me.id = auth.uid())
         and (not is_private or owner = auth.uid() or creator = auth.uid()));

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated with check (false);
