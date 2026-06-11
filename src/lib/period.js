// 日历区间计算：今日/本周(周一起)/本月 + 任意偏移（offset<0 = 往回看）

const DAY = 86400000

export function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // 周一
  return x
}

// 返回 {start, end, label, isCurrent}；end 为开区间
export function periodRange(section, offset = 0) {
  const today = startOfToday()
  if (section === 'today') {
    const start = new Date(today.getTime() + offset * DAY)
    const end = new Date(start.getTime() + DAY)
    const label =
      offset === 0 ? '' : offset === -1 ? '昨天' : `${start.getMonth() + 1}月${start.getDate()}日`
    return { start, end, label, isCurrent: offset === 0 }
  }
  if (section === 'week') {
    const start = new Date(startOfWeek(today).getTime() + offset * 7 * DAY)
    const end = new Date(start.getTime() + 7 * DAY)
    const endShow = new Date(end.getTime() - DAY)
    const label =
      offset === 0
        ? ''
        : offset === -1
          ? '上周'
          : `${start.getMonth() + 1}/${start.getDate()}–${endShow.getMonth() + 1}/${endShow.getDate()}`
    return { start, end, label, isCurrent: offset === 0 }
  }
  // month
  const start = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const end = new Date(today.getFullYear(), today.getMonth() + offset + 1, 1)
  const label =
    offset === 0
      ? ''
      : offset === -1
        ? '上月'
        : `${start.getFullYear()}年${start.getMonth() + 1}月`
  return { start, end, label, isCurrent: offset === 0 }
}

// anchor: 'YYYY-MM-DD' | null。null（老数据/未迁移）按"当前周期"处理。
export function inPeriod(anchor, range) {
  if (!anchor) return range.isCurrent
  const d = new Date(anchor + 'T00:00:00')
  return d >= range.start && d < range.end
}
