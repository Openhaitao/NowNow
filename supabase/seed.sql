-- NowNow 真实模拟数据（在 SQL Editor 里整段运行，可重复跑——每次重跑会重置种子数据）
--
-- 做三件事：
-- 1. 创建一个占位用户「秦天」（真秦天加入后可删，见文件底部的清理 SQL）
-- 2. 给你和秦天各补一行 profiles（你的如果已经起过名，不动）
-- 3. 写入一套真实感条目：覆盖 open/resolved/closed/私密/备忘/收件箱 所有状态
--
-- 种子条目的 id 都以 dddddddd 开头，删起来干净，不碰你手写的真数据。

do $$
declare
  qid uuid;   -- 秦天（占位）
  hid uuid;   -- 你
  hh  text;   -- 你的 handle
begin
  -- ① 占位用户 秦天
  select id into qid from auth.users where email = 'qintian-demo@nownow.local';
  if qid is null then
    qid := gen_random_uuid();
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change)
    values
      ('00000000-0000-0000-0000-000000000000', qid, 'authenticated', 'authenticated',
       'qintian-demo@nownow.local', crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  end if;
  insert into profiles (id, handle, display_name) values (qid, '秦天', '秦天')
    on conflict (id) do nothing;

  -- ② 你 = 库里第一个非占位账号
  select u.id into hid from auth.users u
    where u.email <> 'qintian-demo@nownow.local' order by u.created_at limit 1;
  if hid is null then
    raise exception '没找到你的账号：先用你的邮箱在 now-now.pages.dev 登录一次，再跑本脚本';
  end if;
  insert into profiles (id, handle, display_name) values (hid, '海涛', '海涛')
    on conflict (id) do nothing;
  select handle into hh from profiles where id = hid;

  -- ③ 清旧种子，重新写入
  delete from mentions where id::text like 'dddddddd-%' or entry_id::text like 'dddddddd-%';
  delete from entries  where id::text like 'dddddddd-%';

  insert into entries (id, owner, creator, section, content, is_goal, status, is_private, position) values
  -- —— 你的纸 ——
  ('dddddddd-0000-0000-0000-000000000001', hid, hid, 'today', '把 NowNow 第一版用起来，下午和 @秦天 互相派一单试试', true, 'open',     false, 1),
  ('dddddddd-0000-0000-0000-000000000002', hid, hid, 'today', 'UI 风格参考调研（flomo / Apple Notes）',                true, 'resolved', false, 2),
  ('dddddddd-0000-0000-0000-000000000003', hid, hid, 'today', '备忘：周五前想清楚要不要拉第三个种子用户进来',          false, 'open',    true,  3),
  ('dddddddd-0000-0000-0000-000000000004', hid, hid, 'today', '建好 Supabase 三张表 + RLS',                            true, 'closed',   false, 4),
  ('dddddddd-0000-0000-0000-000000000005', hid, hid, 'week',  'NowNow MVP 上线，俩人互相 @ 着跑一周',                  true, 'open',     false, 5),
  ('dddddddd-0000-0000-0000-000000000006', hid, hid, 'week',  '给 @秦天 过一遍产品文档 v1.0，收反馈',                  true, 'open',     false, 6),
  ('dddddddd-0000-0000-0000-000000000007', hid, hid, 'month', '跑出"每天愿意打开"的习惯，攒 v1.1 需求清单',            true, 'open',     false, 7),
  ('dddddddd-0000-0000-0000-000000000008', hid, hid, 'month', '备忘：v1.1 候选——日期识别、多人@计数、每日摘要',        false, 'open',    false, 8),
  -- —— 秦天的纸 ——
  ('dddddddd-0000-0000-0000-000000000009', qid, qid, 'today', '联调 magic link 在手机上的跳转 @' || hh,                true, 'open',     false, 1),
  ('dddddddd-0000-0000-0000-000000000010', qid, qid, 'today', '收件箱认领流程自测',                                    true, 'closed',   false, 2),
  ('dddddddd-0000-0000-0000-000000000011', qid, qid, 'week',  '试一遍拖动排序的手感，给反馈',                          true, 'open',     false, 3),
  ('dddddddd-0000-0000-0000-000000000012', qid, qid, 'week',  '备忘：周四晚有事，dogfood 反馈周五给',                  false, 'open',    false, 4),
  ('dddddddd-0000-0000-0000-000000000013', qid, qid, 'month', '帮 NowNow 拉第三个种子用户',                            true, 'open',     false, 5);

  -- ④ @关系：你@秦天的两条 + 秦天@你的一条（后者让你的收件箱有一条待认领）
  insert into mentions (id, entry_id, mentioned) values
  ('dddddddd-1111-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', qid),
  ('dddddddd-1111-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000006', qid),
  ('dddddddd-1111-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000009', hid);
end $$;

-- ⑤（以后真秦天来了再跑）清理占位秦天 + 全部种子数据：
-- delete from mentions where id::text like 'dddddddd-%' or entry_id::text like 'dddddddd-%';
-- delete from entries  where id::text like 'dddddddd-%';
-- delete from entries  where owner = (select id from auth.users where email='qintian-demo@nownow.local');
-- delete from profiles where id = (select id from auth.users where email='qintian-demo@nownow.local');
-- delete from auth.users where email = 'qintian-demo@nownow.local';
