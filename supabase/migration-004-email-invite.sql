-- 简化版邀请制（Haitao 拍板）：邀请 = 把对方邮箱加进名单；登录 = 邮箱+密码（邮件链接保留作备用）
-- SQL Editor 整段运行（幂等）。跑完后去 Authentication 设置两个开关：
--   1. Sign In/Up → "Allow new users to sign up" = ON
--   2. Sign In/Up → Email → "Confirm email" = OFF（内部工具，省掉确认邮件，密码注册即时生效）

create table if not exists allowed_emails (
  email      text primary key,
  invited_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table allowed_emails enable row level security;
drop policy if exists ae_select on allowed_emails;
create policy ae_select on allowed_emails for select to authenticated
  using (exists (select 1 from profiles me where me.id = auth.uid() and me.status = 'active'));
drop policy if exists ae_insert on allowed_emails;
create policy ae_insert on allowed_emails for insert to authenticated
  with check (invited_by = auth.uid()
              and exists (select 1 from profiles me where me.id = auth.uid() and me.status = 'active'));
drop policy if exists ae_delete on allowed_emails;
create policy ae_delete on allowed_emails for delete to authenticated
  using (exists (select 1 from profiles me where me.id = auth.uid() and me.status = 'active'));

-- 入门：登录后凭"邮箱在名单里"直接建正式 profile（不再有待确认环节）
create or replace function claim_membership(p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if exists (select 1 from profiles where id = auth.uid()) then return; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if not exists (select 1 from allowed_emails where lower(email) = v_email) then
    raise exception '你的邮箱不在邀请名单里，请让团队成员先把你的邮箱加进来';
  end if;
  if p_name is null or trim(p_name) = '' then raise exception '名字不能为空'; end if;
  insert into profiles (id, handle, display_name, status)
  values (auth.uid(), lower(trim(p_name)), trim(p_name), 'active');
end $$;

-- 把当前已有成员的邮箱补进名单（自洽）
insert into allowed_emails (email, invited_by)
select lower(u.email), p.id from auth.users u join profiles p on p.id = u.id
on conflict (email) do nothing;
