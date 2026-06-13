import { AlarmClock, Bell, CheckCircle2, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月', stash: '暂存箱' }

// 通知 = 只读 FYI（定稿 PRD 六）：对方把我派的活点了已解决、到期提醒、待确认成员。
// 不放需要动作的「待认领」（那在「待我处理」）；resolved 的关闭在我自己纸上的原条目完成，这里只提醒+跳转。
export default function NotificationsPage({ resolvedMine = [], dueMine = [], pendingMembers = [], profiles, onMembersChanged, onJump }) {
  async function approve(p, ok) {
    await supabase.rpc(ok ? 'approve_member' : 'reject_member', { p_id: p.id })
    onMembersChanged?.()
  }

  const empty = resolvedMine.length === 0 && dueMine.length === 0 && pendingMembers.length === 0

  return (
    <div className="pt-1">
      <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold max-md:text-[17px]">
        <Bell size={16} /> 通知
      </div>

      {empty && (
        <p className="mt-6 text-sm text-stone-300 max-md:text-[15px]">
          没有新通知。你派出去的活被对方点「已解决」、到期的目标、申请加入的成员，都会出现在这里。需要你认领的活在「待我处理」。
        </p>
      )}

      {pendingMembers.length > 0 && (
        <div className="mt-5 rounded-lg bg-emerald-50 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700 max-md:text-[13px]">
            <UserPlus size={13} /> 待确认成员 · {pendingMembers.length}
          </div>
          {pendingMembers.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1 text-[13.5px] max-md:py-1.5 max-md:text-[15.5px] text-emerald-900">
              <span className="min-w-0 flex-1">
                <b>{p.display_name}</b> 通过你的邀请链接申请加入
              </span>
              <button
                onClick={() => approve(p, true)}
                className="shrink-0 rounded-md border border-emerald-600 bg-white px-2.5 py-0.5 text-xs text-emerald-700 max-md:py-1 max-md:text-[13px] hover:bg-emerald-600 hover:text-white"
              >
                通过
              </button>
              <button
                onClick={() => approve(p, false)}
                className="shrink-0 rounded-md px-2 py-0.5 text-xs text-stone-400 hover:text-red-600"
              >
                拒绝
              </button>
            </div>
          ))}
        </div>
      )}

      {resolvedMine.length > 0 && (
        <div className="mt-5 rounded-lg bg-blue-50 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-blue-700 max-md:text-[13px]">
            <CheckCircle2 size={13} /> 已解决 · {resolvedMine.length} 条对方已完成，去你纸上验收关闭
          </div>
          {resolvedMine.map((e) => (
            <button
              key={e.id}
              onClick={() => onJump?.(e)}
              className="flex w-full items-center gap-2 py-1 text-left text-[13.5px] max-md:py-1.5 max-md:text-[15.5px] text-blue-900 hover:underline"
            >
              <span className="min-w-0 flex-1 truncate">{e.content}</span>
              <span className="shrink-0 text-[11.5px] text-blue-500">{SECTION_LABELS[e.section]} · 去验收</span>
            </button>
          ))}
        </div>
      )}

      {dueMine.length > 0 && (
        <div className="mt-5 rounded-lg bg-red-50 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-red-700 max-md:text-[13px]">
            <AlarmClock size={13} /> 到期 · {dueMine.length} 条今天到期或已过期
          </div>
          {dueMine.map((e) => (
            <button
              key={e.id}
              onClick={() => onJump?.(e)}
              className="flex w-full items-center gap-2 py-1 text-left text-[13.5px] text-red-900 max-md:py-1.5 max-md:text-[15.5px] hover:underline"
            >
              <span className="min-w-0 flex-1 truncate">{e.content}</span>
              <span className="shrink-0 text-[11.5px] text-red-500">{SECTION_LABELS[e.section]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
