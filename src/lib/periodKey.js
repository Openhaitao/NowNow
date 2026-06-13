// docs 表的 period_key：一份文档 = 一个 (section × period 实例)。
// 复用 period.js 的周期边界（周一起 = ISO 周），不引第二套周定义。
// today → 2026-06-13；week → 2026-W24（ISO）；month → 2026-06；stash → stash
import { fmtDate, periodHeader, periodRange } from './period'

const DAY = 86400000

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfWeek(d) {
  const x = startOfDay(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // 周一，对齐 period.js
  return x
}

// 给定某周的周一，算 ISO 周键 YYYY-Www（ISO 年可能跨自然年）
export function isoWeekKey(monday) {
  const thu = new Date(monday)
  thu.setDate(monday.getDate() + 3) // 该周周四决定 ISO 年
  const isoYear = thu.getFullYear()
  const firstThu = new Date(isoYear, 0, 4) // 1月4日必在第1周
  firstThu.setDate(firstThu.getDate() + 3 - ((firstThu.getDay() + 6) % 7)) // 挪到它那周的周四
  const week = 1 + Math.round((startOfDay(thu) - startOfDay(firstThu)) / (7 * DAY))
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

// 当前/偏移的 period_key（渲染时间线、定位文档用）
export function periodKey(section, offset = 0, base) {
  if (section === 'stash') return 'stash'
  const { start } = periodRange(section, offset, base)
  if (section === 'today') return fmtDate(start)
  if (section === 'week') return isoWeekKey(start)
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}` // month
}

// period_key → 该周期的代表日期（渲染过去块的日期抬头用）
export function dateFromKey(section, key) {
  if (section === 'today') return new Date(key + 'T00:00:00')
  if (section === 'month') {
    const [y, m] = key.split('-').map(Number)
    return new Date(y, m - 1, 1)
  }
  // week: YYYY-Www → 该 ISO 周的周一
  const [y, w] = key.split('-W').map(Number)
  const jan4 = new Date(y, 0, 4)
  const week1Mon = new Date(jan4)
  week1Mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const mon = new Date(week1Mon)
  mon.setDate(week1Mon.getDate() + (w - 1) * 7)
  return mon
}

// period_key → 日期抬头（复用 period.js 的 periodHeader，不另造一套）
export function periodHeaderFromKey(section, key) {
  if (section === 'stash') return ''
  return periodHeader(section, 0, dateFromKey(section, key))
}

// 老数据迁移：某条目 (section, anchor) → 它该归到的 period_key
export function periodKeyFromAnchor(section, anchorStr) {
  if (section === 'stash' || !anchorStr) return section === 'stash' ? 'stash' : null
  const d = startOfDay(new Date(anchorStr + 'T00:00:00'))
  if (section === 'today') return fmtDate(d)
  if (section === 'week') return isoWeekKey(startOfWeek(d))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` // month
}
