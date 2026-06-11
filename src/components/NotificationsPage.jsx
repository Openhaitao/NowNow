import { AlarmClock, ArrowLeft, Bell, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Inbox from './Inbox'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月' }

// 完整通知页：待认领的@ + 我派出去已解决等我关闭的 + 到期/过期的目标
export default function NotificationsPage({ mentions, resolvedMine, dueMine = [], profiles, onChanged, mutate, onBack, onJumpHome }) {
  function closeEntry(e) {
    mutate(
      (list) => list.map((x) => (x.id === e.id ? { ...x, status: 'closed' } : x)),
      () => supabase.from('entries').update({ status: 'closed' }).eq('id', e.id),
    )
  }

  const empty = mentions.length === 0 && resolvedMine.length === 0 && dueMine.length === 0

  return (
    <div>
      <div className="mt-4 flex items-center gap-2 text-[15px] font-semibold">
        <Bell size={16} /> 通知
      </div>

      {empty && (
        <p className="mt-6 text-sm text-stone-300">
          没有新通知。别人 @你 的事、你派出去等验收的事、到期的目标，都会出现在这里。
        </p>
      )}

      {dueMine.length > 0 && (
        <div className="mt-5 rounded-xl bg-red-50 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-red-700">
            <AlarmClock size={13} /> 到期 · {dueMine.length} 条今天到期或已过期
          </div>
          {dueMine.map((e) => (
            <button
              key={e.id}
              onClick={onJumpHome}
              className="flex w-full items-center gap-2 py-1 text-left text-[13.5px] text-red-900 hover:underline"
            >
              <span className="min-w-0 flex-1">{e.content}</span>
              <span className="shrink-0 text-[11.5px] text-red-500">{SECTION_LABELS[e.section]}</span>
            </button>
          ))}
        </div>
      )}

      <Inbox mentions={mentions} profiles={profiles} onChanged={onChanged} />

      {resolvedMine.length > 0 && (
        <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-amber-700">
            <CheckCircle2 size={13} /> 已解决 · {resolvedMine.length} 条等你验收关闭
          </div>
          {resolvedMine.map((e) => (
            <div key={e.id} className="flex items-center gap-2 py-1 text-[13.5px] text-amber-900">
              <span className="min-w-0 flex-1">
                {e.content}
                <span className="ml-1.5 text-[11.5px] text-amber-600">
                  {SECTION_LABELS[e.section]}
                </span>
              </span>
              <button
                onClick={() => closeEntry(e)}
                className="shrink-0 rounded-md border border-amber-600 bg-white px-2.5 py-0.5 text-xs text-amber-700 hover:bg-amber-600 hover:text-white"
              >
                验收关闭
              </button>
            </div>
          ))}
        </div>
      )}

      <button onClick={onBack} className="mt-6 flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600">
        <ArrowLeft size={14} /> 回到我的纸
      </button>
    </div>
  )
}
