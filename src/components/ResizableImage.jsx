import { useRef } from 'react'
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react'

// 飞书云文档式图片：选中=蓝框+四角拖拽手柄（只在选中时显）+ 浮出对齐工具条（左/中/右）。
// 宽度、对齐存进节点 attrs（doc_json 持久化）。文字选中(蓝高亮)与图片选中(蓝框)是两套，互不干扰。
function ResizableImageView({ node, updateAttributes, editor, selected }) {
  const imgRef = useRef(null)
  const editable = editor.isEditable
  const align = node.attrs.align || 'left'

  // 四角拖拽缩放：左侧角往左拖变大（dir=-1），右侧角往右拖变大（dir=1）
  const startResize = (dir) => (e) => {
    if (!editable) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = imgRef.current?.offsetWidth || 300
    const onMove = (ev) => {
      const w = Math.max(60, Math.round(startW + dir * (ev.clientX - startX)))
      updateAttributes({ width: w })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 对齐：onMouseDown + preventDefault，避免点按钮丢掉图片的 NodeSelection
  const setAlign = (a) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    updateAttributes({ align: a })
  }

  return (
    <NodeViewWrapper as="div" className="doc-img-block" style={{ textAlign: align }}>
      <span className={'doc-img-wrap' + (selected ? ' is-selected' : '')}>
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          draggable={false}
          style={{ width: node.attrs.width ? node.attrs.width + 'px' : 'auto' }}
        />
        {editable && selected && (
          <>
            {/* 飞书式对齐工具条：选中浮出 */}
            <span className="doc-img-toolbar" contentEditable={false}>
              <button type="button" className={align === 'left' ? 'on' : ''} onMouseDown={setAlign('left')} title="左对齐">
                <AlignLeft size={15} />
              </button>
              <button type="button" className={align === 'center' ? 'on' : ''} onMouseDown={setAlign('center')} title="居中">
                <AlignCenter size={15} />
              </button>
              <button type="button" className={align === 'right' ? 'on' : ''} onMouseDown={setAlign('right')} title="右对齐">
                <AlignRight size={15} />
              </button>
            </span>
            {/* 四角缩放手柄 */}
            <span className="doc-img-handle tl" onPointerDown={startResize(-1)} title="拖拽缩放" />
            <span className="doc-img-handle tr" onPointerDown={startResize(1)} title="拖拽缩放" />
            <span className="doc-img-handle bl" onPointerDown={startResize(-1)} title="拖拽缩放" />
            <span className="doc-img-handle br" onPointerDown={startResize(1)} title="拖拽缩放" />
          </>
        )}
      </span>
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) => (attrs.width ? { style: `width: ${attrs.width}px` } : {}),
        parseHTML: (el) => (el.style?.width ? parseInt(el.style.width, 10) || null : null),
      },
      align: {
        default: 'left',
        renderHTML: (attrs) => (attrs.align && attrs.align !== 'left' ? { 'data-align': attrs.align } : {}),
        parseHTML: (el) => el.getAttribute('data-align') || 'left',
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})
