import { useState } from 'react'

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日']

function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// 自家样式的小日历（弹在日期按钮下方）。onDelete 提供时显示"删除这个日期"
export default function DatePicker({ value, onSelect, onClose, onDelete }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const init = value || today
  const [ym, setYm] = useState({ y: init.getFullYear(), m: init.getMonth() })

  const first = new Date(ym.y, ym.m, 1)
  const lead = (first.getDay() + 6) % 7 // 周一起
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(ym.y, ym.m, i + 1)),
  ]

  function shift(n) {
    setYm(({ y, m }) => {
      const d = new Date(y, m + n, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-stone-200 bg-white p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => shift(-1)} className="rounded-lg px-2 py-0.5 text-stone-400 hover:bg-stone-100">‹</button>
          <span className="text-[13px] font-medium">{ym.y}年{ym.m + 1}月</span>
          <button onClick={() => shift(1)} className="rounded-lg px-2 py-0.5 text-stone-400 hover:bg-stone-100">›</button>
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 text-center">
          {WEEK_HEAD.map((w) => (
            <span key={w} className="py-1 text-[11px] text-stone-300">{w}</span>
          ))}
          {cells.map((d, i) =>
            d ? (
              <button
                key={i}
                onClick={() => { onSelect(d); onClose() }}
                className={
                  'mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[12.5px] ' +
                  (sameDay(d, value || today)
                    ? 'bg-stone-900 text-white'
                    : sameDay(d, today)
                      ? 'border border-stone-900 text-stone-900'
                      : 'text-stone-600 hover:bg-stone-100')
                }
              >
                {d.getDate()}
              </button>
            ) : (
              <span key={i} />
            ),
          )}
        </div>
        <button
          onClick={() => { onSelect(null); onClose() }}
          className="mt-2 w-full rounded-lg bg-stone-100 py-1 text-[12px] text-stone-500 hover:bg-stone-200"
        >
          回到今天
        </button>
        {onDelete && (
          <button
            onClick={() => { onDelete(); onClose() }}
            className="mt-1 w-full rounded-lg py-1 text-[12px] text-red-600 hover:bg-red-50"
          >
            删除这个日期
          </button>
        )}
      </div>
    </>
  )
}
