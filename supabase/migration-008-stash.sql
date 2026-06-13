-- 008：新增「暂存箱」频道（stash）
-- 定稿 PRD 三：四频道 今日/本周/本月/暂存箱。暂存箱放"想做但还没排期"的条目。
-- entries.section 原 check 只允许 today/week/month，这里放开到含 stash。
-- SQL Editor 整段运行（幂等）。

alter table entries drop constraint if exists entries_section_check;
alter table entries add constraint entries_section_check
  check (section in ('today', 'week', 'month', 'stash'));
