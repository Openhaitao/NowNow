-- Public preflight for fixed invite-code signup.
-- Returns only true/false and never exposes the configured code.

create or replace function validate_invite_code(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select value into v_code from app_settings where key = 'invite_code';
  if v_code is null then
    raise exception '系统未配置邀请码，请联系管理员';
  end if;
  return p_code is not null and trim(p_code) = v_code;
end $$;
