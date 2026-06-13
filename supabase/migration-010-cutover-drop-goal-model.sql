-- 010：CUTOVER 专用 —— ⚠️ 仅在「文档版(docs) 切上 production、textarea 版彻底下线」后再跑！
-- 现在别跑：线上 production 仍是 textarea 版、还在读 entries，提前跑会当场断档。
-- 作用：清掉旧目标模型的内容层（保留 profiles + auth 账号、保留 docs 表）。
-- Supabase 控制台 → SQL Editor 整段运行（幂等）。

drop table if exists mentions cascade;          -- 旧 @任务收件箱（cascade 带走其 policy/index）
drop table if exists entries  cascade;           -- 旧逐行条目（cascade 带走其 policy/trigger/外键）
drop function if exists claim_mention(uuid, text);   -- 旧目标认领 RPC
drop function if exists resolve_entry(uuid);         -- 旧目标已解决 RPC

-- 保留：profiles（账号/handle）、docs（新内容层）、touch_updated_at（docs 仍在用）。
