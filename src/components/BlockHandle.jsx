import { useCallback, useRef } from 'react'
import { DragHandle } from '@tiptap/extension-drag-handle-react'

// 块拖拽手柄：用 Tiptap 官方 @tiptap/extension-drag-handle-react（原生 HTML5 拖拽、和 ProseMirror 的
// 文本选择 / dropcursor / 拖进列表都配套，不监听 keydown → 中文输入法安全）。drag-only，没有块菜单（海涛砍了）。
// 视觉：飞书式 2×3 圆点(.doc-block-grip)、透明无底色、hover 加深。
// hover 手柄时整块蓝高亮（只在鼠标真在 ⠿ 上才高亮，不影响在正文里选字）。
export default function BlockHandle({ editor }) {
  const posRef = useRef(null)
  const litRef = useRef(null)

  const clear = useCallback(() => {
    if (litRef.current) { litRef.current.classList.remove('drag-hover'); litRef.current = null }
  }, [])
  const highlight = useCallback(() => {
    clear()
    const pos = posRef.current
    if (pos == null || !editor) return
    let dom
    try { dom = editor.view.nodeDOM(pos) } catch { return }
    const el = dom && dom.nodeType === 1 ? dom : dom?.parentElement
    if (el && el.classList) { el.classList.add('drag-hover'); litRef.current = el }
  }, [editor, clear])
  // ⚠️ onNodeChange 必须 useCallback 稳定引用：官方 DragHandle 把它放进了注册插件的 useEffect 依赖里，
  // 每次新引用都会卸载/重注册拖拽插件 → 重配编辑器 state → 把 Slash「/」suggestion 的弹框打没（海涛报「/ 弹一下就没」）。
  const onNodeChange = useCallback(({ pos }) => { posRef.current = pos; clear() }, [clear])

  return (
    <DragHandle
      editor={editor}
      onNodeChange={onNodeChange}
    >
      <button type="button" aria-label="拖动" className="doc-block-handle" onMouseEnter={highlight} onMouseLeave={clear}>
        <span className="doc-block-grip" />
      </button>
    </DragHandle>
  )
}
