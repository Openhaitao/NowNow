// 保存状态指示（低干扰，按 @UI 规范）：
// 已保存=最弱 ink-faint、无绿色；保存中=ink-muted；离线=暖灰胶囊「离线编辑中」无警告红；失败=轻危险色+重试。
// state: 'saving' | 'saved' | 'offline' | 'error' | null
export default function SaveStatus({ state, onRetry }) {
  if (!state) return null
  if (state === 'saving')
    return <span className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>保存中…</span>
  if (state === 'saved')
    return <span className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>已保存</span>
  if (state === 'offline')
    return (
      <span
        className="rounded-full px-2 py-0.5 text-[12px]"
        style={{ background: 'var(--surface)', color: 'var(--ink-muted)' }}
      >
        离线编辑中
      </span>
    )
  if (state === 'error')
    return (
      <span className="text-[12px]" style={{ color: 'var(--error)' }}>
        保存失败{' '}
        <button onClick={onRetry} className="underline underline-offset-2">
          重试
        </button>
      </span>
    )
  return null
}
