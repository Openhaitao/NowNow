import { useEffect, useState } from 'react'
import { periodHeader } from '../lib/period'
import { periodHeaderFromKey, periodKey } from '../lib/periodKey'
import { listPeriods } from '../lib/docsApi'
import DocBlock from './DocBlock'

// 一个频道的文档时间线：当前周期可写（占首屏）、过去有内容的周期只读、往下回溯。
// owner=正在看谁的页；section=今日/本周/本月/暂存箱；isMyPage=能不能写。
export default function DocTimeline({ owner, section, isMyPage, baseDate, viewportH, profiles, flashKey }) {
  const curKey = periodKey(section, 0, baseDate)
  const [pastKeys, setPastKeys] = useState([])

  useEffect(() => {
    if (section === 'stash') {
      setPastKeys([])
      return
    }
    let alive = true
    listPeriods(owner, section)
      .then((rows) => alive && setPastKeys(rows.map((r) => r.period_key).filter((k) => k !== curKey)))
      .catch(() => alive && setPastKeys([]))
    return () => {
      alive = false
    }
  }, [owner, section, curKey])

  // 暂存箱：无时间线、单块
  if (section === 'stash') {
    return (
      <div id="doc-stash-stash" className={'pt-1' + (flashKey === 'stash' ? ' doc-flash' : '')} style={viewportH ? { minHeight: viewportH } : undefined}>
        <DocBlock owner={owner} section="stash" periodKey="stash" editable={isMyPage} placeholder="写点什么…" profiles={profiles} />
      </div>
    )
  }

  return (
    <>
      {/* 当前周期：占满首屏、可写。块带 id（doc-section-periodKey）供 @通知跳转滚动定位 */}
      <div id={`doc-${section}-${curKey}`} className={'mb-3' + (flashKey === curKey ? ' doc-flash' : '')} style={viewportH ? { minHeight: viewportH } : undefined}>
        <div className="flex items-center gap-1.5 pb-1 pt-3 text-[13px] font-normal text-stone-500">
          {/* 主题蓝小圆点标记「当前周期」——往下回溯的过去块不带点、颜色更淡 */}
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden />
          {periodHeader(section, 0, baseDate)}
        </div>
        <DocBlock owner={owner} section={section} periodKey={curKey} editable={isMyPage} placeholder="写点什么…" profiles={profiles} />
      </div>
      {/* 过去：只读，往下回溯 */}
      {pastKeys.map((k) => (
        <div key={k} id={`doc-${section}-${k}`} className={'mb-3' + (flashKey === k ? ' doc-flash' : '')}>
          <div className="pb-1 pt-3 text-[13px] font-normal text-stone-400">{periodHeaderFromKey(section, k)}</div>
          <DocBlock owner={owner} section={section} periodKey={k} editable={false} profiles={profiles} />
        </div>
      ))}
    </>
  )
}
