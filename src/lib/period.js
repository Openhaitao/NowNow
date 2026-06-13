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

// 一页纸的区块日期抬头：今日=完整日期+星期；本周=日期范围；本月=年月。
// 返回 {label, date}：label 是区名（今日无 label，直接亮日期），date 是给用户看的时间串。
export function periodHeader(section, base) {
  const today = base ? startOfDay(base) : startOfDay(new Date())
  if (section === 'today') {
    return {
      label: '',
      date: `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 星期${WEEKDAYS[today.getDay()]}`,
    }
  }
  const r = periodRange(section, 0, base)
  if (section === 'week') {
    const endShow = new Date(r.end.getTime() - DAY)
    return {
      label: '本周',
      date: `${r.start.getMonth() + 1}月${r.start.getDate()}日 – ${endShow.getMonth() + 1}月${endShow.getDate()}日`,
    }
  }
  // month
  return { label: '本月', date: `${r.start.getFullYear()}年${r.start.getMonth() + 1}月` }
}

// anchor: 'YYYY-MM-DD' | null。null（老数据/未迁移）按"当前周期"处理。
export function inPeriod(anchor, range) {
  if (!anchor) return range.isCurrent
  const d = new Date(anchor + 'T00:00:00')
  return d >= range.start && d < range.end
}
