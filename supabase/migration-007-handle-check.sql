-- 007：起名重名预检
-- 邀请页（登录前）就能检查名字是否被占用，不用等进门认领时才报错。
-- 只暴露"被占没被占"一个布尔值，不泄露任何成员信息。

create or replace function public.handle_taken(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from profiles where handle = lower(trim(both '@' from trim(p_name)))
  );
$$;

grant execute on function public.handle_taken(text) to anon, authenticated;
