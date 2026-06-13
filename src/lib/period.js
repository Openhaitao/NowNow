// 日历区间计算：今日/本周(周一起)/本月 + 任意偏移（offset<0 = 往回看）

const DAY = 86400000

export function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfWeek(d) {
  const x = startOfDay(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // 周一
  return x
}

// 返回 {start, end, label, isCurrent}；end 为开区间。
// base = 整张纸拨到的日期（不传 = 真实今天）；isCurrent 仅当 offset=0 且 base 就是今天。
export function periodRange(section, offset = 0, base) {
  const today = startOfDay(new Date())
  const anchor = base ? startOfDay(base) : today
  const live = anchor.getTime() === today.getTime()

  if (section === 'today') {
    const start = new Date(anchor.getTime() + offset * DAY)
    const end = new Date(start.getTime() + DAY)
    const isCurrent = offset === 0 && live
    const label = isCurrent
      ? ''
      : start.getTime() === today.getTime() - DAY
        ? '昨天'
        : `${start.getMonth() + 1}月${start.getDate()}日`
    return { start, end, label, isCurrent }
  }
  if (section === 'week') {
    const start = new Date(startOfWeek(anchor).getTime() + offset * 7 * DAY)
    const end = new Date(start.getTime() + 7 * DAY)
    const endShow = new Date(end.getTime() - DAY)
    const isCurrent = offset === 0 && live
    const label = isCurrent
      ? ''
      : start.getTime() === startOfWeek(today).getTime() - 7 * DAY
        ? '上周'
        : `${start.getMonth() + 1}/${start.getDate()}–${endShow.getMonth() + 1}/${endShow.getDate()}`
    return { start, end, label, isCurrent }
  }
  // month
  const start = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1)
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + offset + 1, 1)
  const isCurrent = offset === 0 && live
  const sameYear = start.getFullYear() === today.getFullYear()
  const label = isCurrent
    ? ''
    : start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth() - 1
      ? '上月'
      : sameYear
        ? `${start.getMonth() + 1}月`
        : `${start.getFullYear()}年${start.getMonth() + 1}月`
  return { start, end, label, isCurrent }
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

// 时间线区块的日期抬头（按真实日期算星期，不 hardcode）。
// offset=0 是当前周期（带「今天/本周/本月」前缀更醒目），offset<0 是往回的过去周期。
// 今日 → 6月13日 星期六；本周 → 日期范围；本月 → 年月。
export function periodHeader(section, offset = 0, base) {
  const r = periodRange(section, offset, base)
  const curYear = new Date().getFullYear()
  // 干净优先：同年省略年份，跨年才补「YYYY年」；星期用「周六」不用「星期六」。
  // 日 → 6月13日 周六；周 → 6月9日 – 15日（同月省末端月）；月 → 6月
  const y = (year) => (year === curYear ? '' : `${year}年`)
  if (section === 'today') {
    const d = r.start
    return `${y(d.getFullYear())}${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`
  }
  if (section === 'week') {
    const s = r.start
    const e = new Date(r.end.getTime() - DAY)
    const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()
    const startPart = `${y(s.getFullYear())}${s.getMonth() + 1}月${s.getDate()}日`
    const endPart = sameMonth ? `${e.getDate()}日` : `${y(e.getFullYear())}${e.getMonth() + 1}月${e.getDate()}日`
    return `${startPart} – ${endPart}`
  }
  // month
  return `${y(r.start.getFullYear())}${r.start.getMonth() + 1}月`
}

// 某条目的 anchor 落在该频道的第几个 offset（0=当前周期，负=过去）。null=无 anchor。
// 用于算「有内容的过去周期」从而决定时间线渲染几块。
export function offsetOf(section, anchorStr, base) {
  if (!anchorStr) return null
  const today = base ? startOfDay(base) : startOfDay(new Date())
  const d = startOfDay(new Date(anchorStr + 'T00:00:00'))
  if (section === 'today') return Math.round((d - today) / DAY)
  if (section === 'week') return Math.round((startOfWeek(d) - startOfWeek(today)) / (7 * DAY))
  // month
  return (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth())
}

// anchor: 'YYYY-MM-DD' | null。null（老数据/未迁移）按"当前周期"处理。
export function inPeriod(anchor, range) {
  if (!anchor) return range.isCurrent
  const d = new Date(anchor + 'T00:00:00')
  return d >= range.start && d < range.end
}
