import { useCallback, useEffect, useState } from 'react'
import { periodHeader } from '../lib/period'
import { periodHeaderFromKey, periodKey } from '../lib/periodKey'
import { listPeriods, moveBlockToToday } from '../lib/docsApi'
import DocBlock from './DocBlock'

// 一个频道的文档时间线：当前周期可写（占首屏）、过去有内容的周期只读、往下回溯。
// owner=正在看谁的页；section=今日/本周/本月/收集箱；isMyPage=能不能写。
export default function DocTimeline({ owner, section, tagId = null, isMyPage, baseDate, viewportH, profiles, mentionFreq, mentionStates, flashKey }) {
  const curKey = periodKey(section, 0, baseDate)
  const tagKey = tagId || 'default'
  const [pastKeys, setPastKeys] = useState([])
  const [reloadNonce, setReloadNonce] = useState(0) // 搬块后 bump → 当前块+过去块重挂、读已更新缓存

  // 搬块后刷新：重拉 pastKeys（源块搬空了会消失）+ 重挂块显示新内容（moveBlockToToday 已更新缓存）
  const refresh = useCallback(() => {
    listPeriods(owner, section, tagId)
      .then((rows) => setPastKeys(rows.map((r) => r.period_key).filter((k) => k !== curKey)))
      .catch(() => {})
    setReloadNonce((n) => n + 1)
  }, [owner, section, curKey, tagId])

  // 点过去块的 ⬆️：把该块搬到当前周期（今天），落库走老铁的 moveBlockToToday，成功后刷新
  const carry = useCallback(
    (fromPeriod, blockIndex) => {
      moveBlockToToday({ owner, fromSection: section, fromPeriod, fromTagId: tagId, blockIndex, toSection: section, toPeriod: curKey, toTagId: tagId })
        .then(() => refresh())
        .catch((e) => {
          console.error('搬到今天失败', e)
          alert('搬动失败了，可能内容刚被改过——刷新一下再试。')
        })
    },
    [owner, section, curKey, tagId, refresh],
  )

  useEffect(() => {
    if (section === 'stash') {
      setPastKeys([])
      return
    }
    let alive = true
    listPeriods(owner, section, tagId)
      .then((rows) => alive && setPastKeys(rows.map((r) => r.period_key).filter((k) => k !== curKey)))
      .catch(() => alive && setPastKeys([]))
    return () => {
      alive = false
    }
  }, [owner, section, curKey, tagId])

  // 收集箱：无时间线、单块
  if (section === 'stash') {
    return (
      <div id="doc-stash-stash" className={'pt-1' + (flashKey === 'stash' ? ' doc-flash' : '')}>
        <DocBlock key={`stash-${owner}-${tagKey}`} owner={owner} section="stash" periodKey="stash" tagId={tagId} editable={isMyPage} placeholder="写点什么…" profiles={profiles} mentionFreq={mentionFreq} mentionStates={mentionStates} fill />
      </div>
    )
  }

  return (
    <>
      {/* 当前周期：占满首屏、可写。块带 id（doc-section-periodKey）供 @通知跳转滚动定位 */}
      <div id={`doc-${section}-${curKey}`} className={'mb-3' + (flashKey === curKey ? ' doc-flash' : '')}>
        <div className="flex items-center gap-1.5 pb-1 pt-3 text-[13px] font-normal text-stone-500">
          {/* 主题蓝小圆点标记「当前周期」——往下回溯的过去块不带点、颜色更淡 */}
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden />
          {periodHeader(section, 0, baseDate)}
        </div>
        <DocBlock key={`${owner}-${section}-${curKey}-${tagKey}-${reloadNonce}`} owner={owner} section={section} periodKey={curKey} tagId={tagId} editable={isMyPage} placeholder="写点什么…" profiles={profiles} mentionFreq={mentionFreq} mentionStates={mentionStates} fill />
      </div>
      {/* 过去：只读，往下回溯 */}
      {pastKeys.map((k) => (
        <div key={`${owner}-${section}-${k}-${tagKey}-${reloadNonce}`} id={`doc-${section}-${k}`} className={'mb-3' + (flashKey === k ? ' doc-flash' : '')}>
          <div className="flex items-center gap-1.5 pb-1 pt-3 text-[13px] font-normal text-stone-400">
            {/* 每个时间点旁都带主题蓝小圆点（时间线一致感）*/}
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden />
            {periodHeaderFromKey(section, k)}
          </div>
          {/* 过去块（仅今日时间线、我的页）：每块右侧 ⬆️ 搬到今天 */}
          <DocBlock
            owner={owner}
            section={section}
            periodKey={k}
            tagId={tagId}
            editable={isMyPage}
            placeholder="写点什么…"
            profiles={profiles}
            mentionFreq={mentionFreq}
            mentionStates={mentionStates}
            onCarry={isMyPage && section === 'today' ? (blockIndex) => carry(k, blockIndex) : undefined}
          />
        </div>
      ))}
    </>
  )
}
