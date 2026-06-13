-- ============================================================================
-- NowNow 真实模拟数据种子（Supabase SQL Editor 跑，service role）
-- 建 张三/李四，给 海涛+张三+李四 铺 今日/本周/本月/暂存 + 过去几天/2周/2月，
-- 并写入互相 @ 派活通知（doc_mentions，部分未读=收件箱）。今天基准 2026-06-14(周日)。
-- 建号块 = 老铁；docs/doc_mentions 内容 = Vincent。可重复跑（先清这三人的 docs）。
-- ============================================================================

-- ---- 构造 doc_json 的临时小工具（末尾 drop）----
create or replace function _p(t text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type','paragraph','content',
    case when t='' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('type','text','text',t)) end);
$$;
create or replace function _h(lvl int, t text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type','heading','attrs',jsonb_build_object('level',lvl),
    'content',jsonb_build_array(jsonb_build_object('type','text','text',t)));
$$;
create or replace function _task(checked bool, t text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type','taskItem','attrs',jsonb_build_object('checked',checked),
    'content',jsonb_build_array(_p(t)));
$$;
create or replace function _tasks(items jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('type','taskList','content',items);
$$;
-- 段落带一个 @提及：pre + @label + post（pre/post 为空时不产生空 text 节点——PM 不允许空 text）
create or replace function _pat(pre text, mid uuid, label text, post text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type','paragraph','content',
    (case when pre='' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('type','text','text',pre)) end)
    || jsonb_build_array(jsonb_build_object('type','mention','attrs',jsonb_build_object('id',mid::text,'label',label)))
    || (case when post='' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('type','text','text',post)) end));
$$;
create or replace function _doc(blocks jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('type','doc','content',blocks);
$$;

do $$
declare zid uuid; lid uuid; hid uuid; d uuid;
begin
  -- ===== 建号（老铁块）=====
  select id into zid from auth.users where email='zhangsan-demo@nownow.local';
  if zid is null then
    zid := gen_random_uuid();
    insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
    values ('00000000-0000-0000-0000-000000000000',zid,'authenticated','authenticated','zhangsan-demo@nownow.local',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
  end if;
  insert into profiles (id,handle,display_name,status) values (zid,'张三','张三','active') on conflict (id) do update set status='active';

  select id into lid from auth.users where email='lisi-demo@nownow.local';
  if lid is null then
    lid := gen_random_uuid();
    insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
    values ('00000000-0000-0000-0000-000000000000',lid,'authenticated','authenticated','lisi-demo@nownow.local',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
  end if;
  insert into profiles (id,handle,display_name,status) values (lid,'李四','李四','active') on conflict (id) do update set status='active';

  -- 海涛 = 唯一非 demo 的 profile
  select id into hid from profiles where id not in (zid,lid) order by created_at limit 1;
  if hid is null then raise exception '没找到海涛账号：先注册/登录一次再跑'; end if;

  -- ===== 清旧种子（这三人 docs，doc_mentions 级联）=====
  delete from docs where owner in (hid,zid,lid);

  -- ========================= 海涛 =========================
  -- today 2026-06-14（@张三 @李四）
  insert into docs(owner,section,period_key,doc_json,doc_text) values
   (hid,'today','2026-06-14', _doc(jsonb_build_array(
     _h(2,'今日重点'),
     _tasks(jsonb_build_array(
       _task(false,'看完思博威视的尽调材料、列 3 个关键问题'),
       _task(true ,'和 LP 周会，同步 Q2 组合表现'),
       _task(false,'NowNow 编辑器体验走查，记 bug'))),
     _pat('', zid, '张三', ' 把思博威视的财务模型今天发我'),
     _pat('', lid, '李四', ' 同步下本周 BD 的进展'))),
     '今日重点 看完思博威视的尽调材料 和 LP 周会 NowNow 编辑器体验走查 @张三 把思博威视的财务模型今天发我 @李四 同步下本周 BD 的进展')
   returning id into d;
  insert into doc_mentions(doc_id,mentioned,author) values (d,zid,hid),(d,lid,hid);

  -- week 2026-W24（@李四）
  insert into docs(owner,section,period_key,doc_json,doc_text) values
   (hid,'week','2026-W24', _doc(jsonb_build_array(
     _h(2,'本周目标'),
     _tasks(jsonb_build_array(
       _task(false,'NowNow 编辑器打磨到可日常书写'),
       _task(false,'推动 3 个在投项目过会'),
       _task(true ,'完成 Q2 LP 报告初稿'))),
     _pat('', lid, '李四', ' 本周把 BD 漏斗的数据整理出来'))),
     '本周目标 NowNow 编辑器打磨 3 个项目过会 Q2 LP 报告 @李四 本周把 BD 漏斗的数据整理出来')
   returning id into d;
  insert into doc_mentions(doc_id,mentioned,author) values (d,lid,hid);

  -- 海涛 其余（无 @）
  insert into docs(owner,section,period_key,doc_json,doc_text) values
   (hid,'today','2026-06-13', _doc(jsonb_build_array(
     _h(2,'昨日复盘'),
     _tasks(jsonb_build_array(
       _task(true ,'过会：新能源储能项目，通过'),
       _task(true ,'回复 3 家 LP 的季度问询'),
       _task(false,'写「一张纸」产品复盘 → 顺延到今天'))))),
     '昨日复盘 过会 新能源储能 回复 LP 季度问询'),
   (hid,'today','2026-06-12', _doc(jsonb_build_array(
     _p('上午看了两个 AI Infra 的项目，估值都偏高；下午和团队对齐了 NowNow 的去目标化方向。'))),
     '上午看了两个 AI Infra 的项目 估值偏高 下午对齐 NowNow 去目标化'),
   (hid,'week','2026-W23', _doc(jsonb_build_array(
     _h(2,'上周回顾'),
     _p('完成了 NowNow Tiptap 内核迁移、上线邀请码注册。两个项目进入尽调。'))),
     '上周回顾 NowNow Tiptap 内核迁移 邀请码注册 两个项目进入尽调'),
   (hid,'month','2026-06', _doc(jsonb_build_array(
     _h(2,'6 月 OKR'),
     _tasks(jsonb_build_array(
       _task(false,'O1 NowNow MVP 给团队日常用起来'),
       _task(false,'O2 完成 2 笔新投资的过会'),
       _task(false,'O3 Q2 LP 关系维护（季度信 + 1v1）'))))),
     '6 月 OKR NowNow MVP 2 笔新投资 Q2 LP 关系'),
   (hid,'month','2026-05', _doc(jsonb_build_array(
     _h(2,'5 月回顾'),
     _p('完成 1 笔储能项目投资；NowNow 从想法到第一版原型。'))),
     '5 月回顾 储能项目投资 NowNow 原型'),
   (hid,'stash','stash', _doc(jsonb_build_array(
     _h(3,'碎记 / 灵感'),
     _tasks(jsonb_build_array(
       _task(false,'NowNow 以后做多人协作光标（Yjs + DO）'),
       _task(false,'读《结网》第 3 遍'),
       _task(false,'看一下飞书文档的表格交互'))))),
     '碎记 灵感 多人协作光标 Yjs DO 结网 飞书文档表格');

  -- ========================= 张三 =========================
  -- today 2026-06-14（@海涛，未读）
  insert into docs(owner,section,period_key,doc_json,doc_text) values
   (zid,'today','2026-06-14', _doc(jsonb_build_array(
     _h(2,'今天'),
     _tasks(jsonb_build_array(
       _task(false,'整理思博威视财务模型 → 发海涛'),
       _task(false,'约创始人周一访谈'))),
     _pat('', hid, '海涛', ' 思博威视的模型我下午 4 点前发你，先发框架'))),
     '今天 整理思博威视财务模型 约创始人访谈 @海涛 模型下午发你')
   returning id into d;
  insert into doc_mentions(doc_id,mentioned,author) values (d,hid,zid);

  insert into docs(owner,section,period_key,doc_json,doc_text) values
   (zid,'today','2026-06-13', _doc(jsonb_build_array(
     _p('读完两份 AI Agent 赛道的研报，整理了竞品图谱。'))),
     '读完两份 AI Agent 赛道研报 竞品图谱'),
   (zid,'today','2026-06-11', _doc(jsonb_build_array(
     _p('行业访谈：和一位储能行业的老兵聊了 1 小时，记了 5 页纸。'))),
     '行业访谈 储能行业 记 5 页纸'),
   (zid,'week','2026-W24', _doc(jsonb_build_array(
     _h(2,'本周'),
     _tasks(jsonb_build_array(
       _task(false,'完成思博威视尽调报告'),
       _task(false,'跟 2 个 AI 项目的初筛'))))),
     '本周 思博威视尽调报告 2 个 AI 项目初筛'),
   (zid,'week','2026-W22', _doc(jsonb_build_array(
     _p('两周前主要在搭赛道地图，覆盖了 AI Infra / Agent / 储能三条线。'))),
     '两周前 搭赛道地图 AI Infra Agent 储能'),
   (zid,'month','2026-06', _doc(jsonb_build_array(
     _h(2,'6 月'),
     _p('目标：产出 2 份深度尽调 + 1 份赛道研究。'))),
     '6 月 2 份深度尽调 1 份赛道研究'),
   (zid,'month','2026-04', _doc(jsonb_build_array(
     _p('4 月：完成消费赛道复盘，结论是暂时回避。'))),
     '4 月 消费赛道复盘 暂时回避'),
   (zid,'stash','stash', _doc(jsonb_build_array(
     _h(3,'待读'),
     _tasks(jsonb_build_array(
       _task(false,'a16z 最新的 AI 报告'),
       _task(false,'整理 LP 常问的 10 个问题'))))),
     '待读 a16z AI 报告 LP 常问 10 个问题');

  -- ========================= 李四 =========================
  -- today 2026-06-14（@海涛，未读）
  insert into docs(owner,section,period_key,doc_json,doc_text) values
   (lid,'today','2026-06-14', _doc(jsonb_build_array(
     _h(2,'今天'),
     _tasks(jsonb_build_array(
       _task(true ,'更新 BD 漏斗表'),
       _task(false,'约 3 家被投公司的月度沟通'))),
     _pat('', hid, '海涛', ' BD 漏斗已更新，本周新增 5 个有效线索，详情看我本周'))),
     '今天 更新 BD 漏斗表 约 3 家被投公司 @海涛 本周新增 5 个有效线索')
   returning id into d;
  insert into doc_mentions(doc_id,mentioned,author) values (d,hid,lid);

  -- week 2026-W24（@张三，未读）
  insert into docs(owner,section,period_key,doc_json,doc_text) values
   (lid,'week','2026-W24', _doc(jsonb_build_array(
     _h(2,'本周'),
     _tasks(jsonb_build_array(
       _task(false,'BD 漏斗新增 5 个有效线索'),
       _task(false,'组织一次被投 CEO 小范围晚宴'))),
     _pat('', zid, '张三', ' 那 3 个早期项目的 BP 我转你初筛'))),
     '本周 BD 漏斗 5 个有效线索 被投 CEO 晚宴 @张三 那 3 个早期项目的 BP 我转你初筛')
   returning id into d;
  insert into doc_mentions(doc_id,mentioned,author) values (d,zid,lid);

  insert into docs(owner,section,period_key,doc_json,doc_text) values
   (lid,'today','2026-06-13', _doc(jsonb_build_array(
     _p('对接了一个 FA 渠道，拿到 3 个早期项目的 BP。'))),
     '对接 FA 渠道 3 个早期项目 BP'),
   (lid,'today','2026-06-10', _doc(jsonb_build_array(
     _p('安排了被投公司「云栈科技」的招聘对接，推了 2 位候选人。'))),
     '云栈科技 招聘对接 推了 2 位候选人'),
   (lid,'week','2026-W23', _doc(jsonb_build_array(
     _p('上周做了一轮投后满意度回访，整体反馈正向。'))),
     '上周 投后满意度回访 反馈正向'),
   (lid,'month','2026-06', _doc(jsonb_build_array(
     _h(2,'6 月'),
     _p('目标：BD 有效线索 20+，落地 2 场被投活动。'))),
     '6 月 BD 有效线索 20 落地 2 场被投活动'),
   (lid,'month','2026-05', _doc(jsonb_build_array(
     _p('5 月：搭起了 BD 漏斗表，跑通了从线索到初筛的流程。'))),
     '5 月 搭起 BD 漏斗表 线索到初筛'),
   (lid,'stash','stash', _doc(jsonb_build_array(
     _h(3,'资源 / 备忘'),
     _tasks(jsonb_build_array(
       _task(false,'整理 FA 渠道清单'),
       _task(false,'被投公司福利对接（云服务 / 招聘）'))))),
     '资源 备忘 FA 渠道清单 被投公司福利对接');

  -- 海涛发出的 @ 标已读；别人 @海涛 / @张三 的留未读（收件箱有红点）
  update doc_mentions set read_at = now() where author = hid;

  raise notice 'seed done: 海涛=%  张三=%  李四=%', hid, zid, lid;
end $$;

drop function if exists _p(text);
drop function if exists _h(int,text);
drop function if exists _task(bool,text);
drop function if exists _tasks(jsonb);
drop function if exists _pat(text,uuid,text,text);
drop function if exists _doc(jsonb);
