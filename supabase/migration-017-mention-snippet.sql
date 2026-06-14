-- 017：@通知带上「被@那段的文本」(snippet)，通知信息量更高（Haitao）。
-- additive：doc_mentions 加一列。写入在客户端 syncDocMentions（抽取被@人所在段落文本）。
-- 快照语义：snippet 记录 @ 当下那句话；老数据为空、新 @ 才有。SQL Editor 整段跑（幂等）。

alter table doc_mentions add column if not exists snippet text;
