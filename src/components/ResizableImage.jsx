import { useRef } from 'react'
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'

// 飞书云文档式：图片右下角拖拽自由缩放，宽度存进节点 attrs（doc_json 里持久化）。
function ResizableImageView({ node, updateAttributes, editor }) {
  const imgRef = useRef(null)
  const editable = editor.isEditable

  const startResize = (e) => {
    if (!editable) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = imgRef.current?.offsetWidth || 300
    const onMove = (ev) => {
      const w = Math.max(60, Math.round(startW + (ev.clientX - startX)))
      updateAttributes({ width: w })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <NodeViewWrapper as="span" className="doc-img-wrap">
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        draggable={false}
        style={{ width: node.attrs.width ? node.attrs.width + 'px' : 'auto' }}
      />
      {editable && <span className="doc-img-handle" onPointerDown={startResize} title="拖拽缩放" />}
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
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})
