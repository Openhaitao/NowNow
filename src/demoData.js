// 演示数据：?demo 模式专用，不写数据库。展示所有条目状态。
const H = 'demo-haitao'
const Q = 'demo-qintian'

export const demoProfiles = [
  { id: H, handle: '海涛', display_name: '海涛', created_at: '2026-06-12T00:00:00Z' },
  { id: Q, handle: '秦天', display_name: '秦天', created_at: '2026-06-12T00:01:00Z' },
]

export const demoMe = demoProfiles[0]

let n = 0
const e = (owner, section, content, extra = {}) => ({
  id: `demo-e${++n}`,
  owner,
  creator: extra.creator || owner,
  section,
  content,
  is_goal: extra.is_goal ?? true,
  status: extra.status || 'open',
  is_private: extra.is_private || false,
  source_entry: extra.source_entry || null,
  position: n,
  created_at: '2026-06-12T01:00:00Z',
  updated_at: '2026-06-12T01:00:00Z',
})

export const demoEntries = [
  // —— 海涛的纸 ——
  e(H, 'today', '把 schema 跑通，@秦天 加白名单 6/15'),
  e(H, 'today', 'UI 风格参考调研', { status: 'resolved' }),
  e(H, 'today', '备忘：周五前想清楚要不要给 Allen 看竞品分析', { is_goal: false, is_private: true }),
  e(H, 'today', '建好 Supabase 三张表', { status: 'closed' }),
  e(H, 'week', 'NowNow MVP 上线，俩人互相 @ 着跑一周'),
  e(H, 'week', '看完《产品文档 v1.0》给反馈 @秦天'),
  e(H, 'month', '跑出"每天愿意打开"的习惯，攒 v1.1 需求清单'),
  e(H, 'month', '备忘：v1.1 候选——日期识别、多人@计数、每日摘要', { is_goal: false }),
  // —— 秦天的纸 ——
  e(Q, 'today', '联调 magic link 在手机上的跳转 @海涛'),
  e(Q, 'today', '收件箱认领流程自测', { status: 'closed' }),
  e(Q, 'week', '把拖动排序的交互试一遍给反馈'),
  e(Q, 'week', '备忘：周四晚有事，dogfood 反馈周五给', { is_goal: false }),
  e(Q, 'month', '帮 NowNow 拉第三个种子用户'),
]

export const demoMentions = [
  {
    id: 'demo-m1',
    entry_id: 'demo-e9',
    mentioned: H,
    claimed_entry: null,
    created_at: '2026-06-12T01:02:00Z',
    entries: { content: '联调 magic link 在手机上的跳转 @海涛', creator: Q },
  },
]
