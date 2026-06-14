-- 固定邀请码注册（Haitao）：公开入口输一个固定邀请码即可注册（直接 active）。
-- 与"每人固定邀请链接"(redeem_invite) 并存 —— 两套一起走。
-- SQL Editor 整段运行（幂等）。
-- 改邀请码： update app_settings set value = '新码' where key = 'invite_code';

create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- 邀请码（Haitao 定：V我50）。改码： update app_settings set value='新码' where key='invite_code';
insert into app_settings (key, value) values ('invite_code', 'V我50')
  on conflict (key) do nothing;

-- app_settings 是门禁、不对外可读：开 RLS 且不给任何 policy → 客户端读不到 value，
-- 校验只在下面的 security definer 函数里做（绕过 RLS 读取）。
alter table app_settings enable row level security;

-- 凭固定邀请码建 active profile（和 claim_membership / redeem_invite 平行，门换成"码"）
-- 签名与 Vincent 前端对齐：redeem_code(p_code, p_name)
create or replace function redeem_code(p_code text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text; v_email text;
begin
  -- 已有 profile 直接返回（幂等，防重复进门）
  if exists (select 1 from profiles where id = auth.uid()) then return; end if;
  select value into v_code from app_settings where key = 'invite_code';
  if v_code is null then raise exception '系统未配置邀请码，请联系管理员'; end if;
  if p_code is null or trim(p_code) <> v_code then raise exception '邀请码不对'; end if;
  if p_name is null or trim(p_name) = '' then raise exception '名字不能为空'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  insert into profiles (id, handle, display_name, status, email)
  values (auth.uid(), lower(trim(p_name)), trim(p_name), 'active', v_email);
end $$;
