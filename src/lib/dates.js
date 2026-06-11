// 自然语言日期识别（中文优先，渲染时解析，不存库——完全可逆）
// 支持：今天/明天/后天、(下)周X、X月X日/号、6/15

const WEEKDAYS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }

export const DATE_TOKEN_RE =
  /(今天|明天|后天|下?(?:周|星期|礼拜)[一二三四五六日天]|\d{1,2}月\d{1,2}[日号]|\d{1,2}\/\d{1,2}(?!\d))/g

// token → Date（解析失败返回 null）
export function resolveDateToken(token, now = new Date()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const DAY = 86400000

  if (token === '今天') return today
  if (token === '明天') return new Date(today.getTime() + DAY)
  if (token === '后天') return new Date(today.getTime() + 2 * DAY)

  const wk = /^(下)?(?:周|星期|礼拜)([一二三四五六日天])$/.exec(token)
  if (wk) {
    // 周X = 未来最近的那个X（含今天）；下周X = 再加 7 天
    let diff = (WEEKDAYS[wk[2]] - today.getDay() + 7) % 7
    if (wk[1]) diff += 7
    return new Date(today.getTime() + diff * DAY)
  }

  const cn = /^(\d{1,2})月(\d{1,2})[日号]$/.exec(token)
  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(token)
  const md = cn || slash
  if (md) {
    const m = Number(md[1])
    const d = Number(md[2])
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    const cand = new Date(today.getFullYear(), m - 1, d)
    // 已过去超过 60 天的按明年理解（"1月5日"在12月说=明年）
    if (today - cand > 60 * DAY) cand.setFullYear(cand.getFullYear() + 1)
    return cand
  }
  return null
}

// 状态：overdue / today / future
export function dateTokenState(token, now = new Date()) {
  const d = resolveDateToken(token, now)
  if (!d) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  if (d < today) return 'overdue'
  if (d.getTime() === today.getTime()) return 'today'
  return 'future'
}
