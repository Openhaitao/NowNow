import { useEffect, useRef, useState } from 'react'
import DocEditor from './DocEditor'
import { loadDoc, saveDoc } from '../lib/docsApi'

// 时间线里的一个文档块 = 一个 (owner, section, period_key)。
// 当前周期可写（防抖 600ms 自动落库）；过去/别人的只读。
export default function DocBlock({ owner, section, periodKey, editable, placeholder, profiles }) {
  const [content, setContent] = useState(undefined) // undefined=加载中, null=空, obj=PM JSON
  const saveTimer = useRef(null)

  useEffect(() => {
    let alive = true
    setContent(undefined)
    loadDoc(owner, section, periodKey)
      .then((j) => alive && setContent(j ?? null))
      .catch(() => alive && setContent(null))
    return () => {
      alive = false
      clearTimeout(saveTimer.current)
    }
  }, [owner, section, periodKey])

  if (content === undefined) {
    return <div className="py-2 text-[13px] text-stone-300">加载中…</div>
  }

  return (
    <DocEditor
      content={content || undefined}
      editable={editable}
      placeholder={placeholder}
      profiles={profiles}
      onChange={({ json, text }) => {
        if (!editable) return
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          saveDoc({ owner, section, periodKey, json, text }).catch((e) => console.error('saveDoc 失败', e))
        }, 600)
      }}
    />
  )
}
