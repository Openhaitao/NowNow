-- 邀请链接直通（Haitao）：保留"每人一条邀请链接"机制，但**去掉审批**——
-- 点邀请链接注册的人直接 active，不再 pending、不需邀请人在通知页通过。
-- 与固定邀请码 redeem_code 并存（链接走 token，码走固定值）。
-- SQL Editor 整段运行（幂等）。approve_member/reject_member 保留但不再用到。

create or replace function redeem_invite(p_token uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype;
begin
  if exists (select 1 from profiles where id = auth.uid()) then return; end if;
  select * into inv from invites where token = p_token and revoked = false;
  if not found then raise exception '邀请链接无效或已作废'; end if;
  if p_name is null or trim(p_name) = '' then raise exception '名字不能为空'; end if;
  -- 直接 active（原来是 'pending' 等审批，Haitao 要直通）
  insert into profiles (id, handle, display_name, status, invited_with, email)
  values (auth.uid(), lower(trim(p_name)), trim(p_name), 'active', p_token,
          (select lower(email) from auth.users where id = auth.uid()));
end $$;
