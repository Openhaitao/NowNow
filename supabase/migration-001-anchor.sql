-- 时间锚定：每条目记一个日期，今日/本周/本月按真实日历过滤，历史随时回看
-- SQL Editor 整段运行一次即可（幂等）。跑完前端自动升级，不用改别的。
alter table entries add column if not exists anchor date not null default current_date;
create index if not exists entries_anchor_idx on entries (owner, section, anchor);
