-- 前端「复制邀请链接」需要读邀请码，但 app_settings 开了 RLS 且无 policy、客户端读不到。
-- 开一个 security definer 口子：只给**已登录的 active 成员**返回 invite_code；
-- anon / 半注册（没 active profile）返回 null —— 码不会泄露给未登录访客。
-- SQL Editor 整段运行（幂等）。

create or replace function get_invite_code()
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and status = 'active') then
    return null;
  end if;
  return (select value from app_settings where key = 'invite_code');
end $$;
