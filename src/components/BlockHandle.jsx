import { useRef } from 'react'
import { DragHandle } from '@tiptap/extension-drag-handle-react'

// 块拖拽手柄：用 Tiptap 官方 @tiptap/extension-drag-handle-react（原生 HTML5 拖拽、和 ProseMirror 的
// 文本选择 / dropcursor / 拖进列表都配套，不监听 keydown → 中文输入法安全）。drag-only，没有块菜单（海涛砍了）。
// 视觉：飞书式 2×3 圆点(.doc-block-grip)、透明无底色、hover 加深。
// hover 手柄时整块蓝高亮（只在鼠标真在 ⠿ 上才高亮，不影响在正文里选字）。
export default function BlockHandle({ editor }) {
  const posRef = useRef(null)
  const litRef = useRef(null)

  const clear = () => {
    if (litRef.current) { litRef.current.classList.remove('drag-hover'); litRef.current = null }
  }
  const highlight = () => {
    clear()
    const pos = posRef.current
    if (pos == null || !editor) return
    let dom
    try { dom = editor.view.nodeDOM(pos) } catch { return }
    const el = dom && dom.nodeType === 1 ? dom : dom?.parentElement
    if (el && el.classList) { el.classList.add('drag-hover'); litRef.current = el }
  }

  return (
    <DragHandle
      editor={editor}
      onNodeChange={({ pos }) => { posRef.current = pos; clear() }}
    >
      <button type="button" aria-label="拖动" className="doc-block-handle" onMouseEnter={highlight} onMouseLeave={clear}>
        <span className="doc-block-grip" />
      </button>
    </DragHandle>
  )
}
