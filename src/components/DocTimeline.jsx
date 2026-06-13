import { useEffect, useState } from 'react'
import { periodHeader } from '../lib/period'
import { periodHeaderFromKey, periodKey } from '../lib/periodKey'
import { listPeriods } from '../lib/docsApi'
import DocBlock from './DocBlock'

// 一个频道的文档时间线：当前周期可写（占首屏）、过去有内容的周期只读、往下回溯。
// owner=正在看谁的页；section=今日/本周/本月/暂存箱；isMyPage=能不能写。
export default function DocTimeline({ owner, section, isMyPage, baseDate, viewportH, profiles }) {
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
      <div className="pt-1" style={viewportH ? { minHeight: viewportH } : undefined}>
        <DocBlock owner={owner} section="stash" periodKey="stash" editable={isMyPage} placeholder="写点什么…" profiles={profiles} />
      </div>
    )
  }

  return (
    <>
      {/* 当前周期：占满首屏、可写 */}
      <div className="mb-3" style={viewportH ? { minHeight: viewportH } : undefined}>
        <div className="pb-0.5 pt-3 text-[13px] font-medium text-stone-500">{periodHeader(section, 0, baseDate)}</div>
        <DocBlock owner={owner} section={section} periodKey={curKey} editable={isMyPage} placeholder="写点什么…" profiles={profiles} />
      </div>
      {/* 过去：只读，往下回溯 */}
      {pastKeys.map((k) => (
        <div key={k} className="mb-3">
          <div className="pb-0.5 pt-3 text-[13px] font-medium text-stone-500">{periodHeaderFromKey(section, k)}</div>
          <DocBlock owner={owner} section={section} periodKey={k} editable={false} profiles={profiles} />
        </div>
      ))}
    </>
  )
}
