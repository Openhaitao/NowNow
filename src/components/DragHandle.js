// 块拖拽把手 —— fork 自 tiptap-extension-global-drag-handle@0.1.18，去掉了它唯一的
// 键盘事件处理（handleDOMEvents.keydown）。原扩展会打断中文/CJK 输入法合成，
// 而它对键盘的唯一触点就是那个 keydown→hideDragHandle。删掉后本扩展只剩鼠标/拖拽
// 事件（mousemove/mousewheel/dragstart/drop/dragend），不碰键盘/composition → IME 安全。
// 把手改成「滚动/移出编辑器时隐藏」，不再「按键时隐藏」（按键隐藏正是 IME 隐患来源）。
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { Slice, Fragment } from '@tiptap/pm/model'
import * as pmView from '@tiptap/pm/view'

function serializeForClipboard(view, slice) {
  if (view && typeof view.serializeForClipboard === 'function') return view.serializeForClipboard(slice)
  if (pmView && typeof pmView.__serializeForClipboard === 'function') return pmView.__serializeForClipboard(view, slice)
  throw new Error('No supported clipboard serialization method found.')
}

function absoluteRect(node) {
  const data = node.getBoundingClientRect()
  const modal = node.closest('[role="dialog"]')
  if (modal && window.getComputedStyle(modal).transform !== 'none') {
    const modalRect = modal.getBoundingClientRect()
    return { top: data.top - modalRect.top, left: data.left - modalRect.left, width: data.width }
  }
  return { top: data.top, left: data.left, width: data.width }
}

function nodeDOMAtCoords(coords, options) {
  const selectors = [
    'li', 'p:not(:first-child)', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    ...options.customNodes.map((node) => `[data-type=${node}]`),
  ].join(', ')
  return document
    .elementsFromPoint(coords.x, coords.y)
    .find((elem) => elem.parentElement?.matches?.('.ProseMirror') || elem.matches(selectors))
}

function nodePosAtDOM(node, view, options) {
  const boundingRect = node.getBoundingClientRect()
  return view.posAtCoords({ left: boundingRect.left + 50 + options.dragHandleWidth, top: boundingRect.top + 1 })?.inside
}

function calcNodePos(pos, view) {
  const $pos = view.state.doc.resolve(pos)
  if ($pos.depth > 1) return $pos.before($pos.depth)
  return pos
}

function DragHandlePlugin(options) {
  let listType = ''
  function handleDragStart(event, view) {
    view.focus()
    if (!event.dataTransfer) return
    const node = nodeDOMAtCoords({ x: event.clientX + 50 + options.dragHandleWidth, y: event.clientY }, options)
    if (!(node instanceof Element)) return
    let draggedNodePos = nodePosAtDOM(node, view, options)
    if (draggedNodePos == null || draggedNodePos < 0) return
    draggedNodePos = calcNodePos(draggedNodePos, view)
    const { from, to } = view.state.selection
    const diff = from - to
    const fromSelectionPos = calcNodePos(from, view)
    let differentNodeSelected = false
    const nodePos = view.state.doc.resolve(fromSelectionPos)
    if (nodePos.node().type.name === 'doc') differentNodeSelected = true
    else {
      const nodeSelection = NodeSelection.create(view.state.doc, nodePos.before())
      differentNodeSelected = !(draggedNodePos + 1 >= nodeSelection.$from.pos && draggedNodePos <= nodeSelection.$to.pos)
    }
    let selection = view.state.selection
    if (!differentNodeSelected && diff !== 0 && !(view.state.selection instanceof NodeSelection)) {
      const endSelection = NodeSelection.create(view.state.doc, to - 1)
      selection = TextSelection.create(view.state.doc, draggedNodePos, endSelection.$to.pos)
    } else {
      selection = NodeSelection.create(view.state.doc, draggedNodePos)
      if (selection.node.type.isInline || selection.node.type.name === 'tableRow') {
        const $pos = view.state.doc.resolve(selection.from)
        selection = NodeSelection.create(view.state.doc, $pos.before())
      }
    }
    view.dispatch(view.state.tr.setSelection(selection))
    if (view.state.selection instanceof NodeSelection && view.state.selection.node.type.name === 'listItem') {
      listType = node.parentElement.tagName
    }
    const slice = view.state.selection.content()
    const { dom, text } = serializeForClipboard(view, slice)
    event.dataTransfer.clearData()
    event.dataTransfer.setData('text/html', dom.innerHTML)
    event.dataTransfer.setData('text/plain', text)
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setDragImage(node, 0, 0)
    view.dragging = { slice, move: event.ctrlKey }
  }

  let dragHandleElement = null
  // hover 手柄时整块高亮（海涛要的主题蓝 --accent-soft 背景）
  let hoveredBlock = null
  function setHoverBlock(el) {
    const target = el && el.classList ? el : null
    if (hoveredBlock === target) return
    if (hoveredBlock) hoveredBlock.classList.remove('drag-hover')
    hoveredBlock = target
    if (hoveredBlock) hoveredBlock.classList.add('drag-hover')
  }
  function clearHoverBlock() { if (hoveredBlock) { hoveredBlock.classList.remove('drag-hover'); hoveredBlock = null } }
  function hideDragHandle() { if (dragHandleElement) dragHandleElement.classList.add('hide'); clearHoverBlock() }
  function showDragHandle() { if (dragHandleElement) dragHandleElement.classList.remove('hide') }
  function hideHandleOnEditorOut(event) {
    if (event.target instanceof Element) {
      const relatedTarget = event.relatedTarget
      const isInsideEditor = relatedTarget?.classList.contains('tiptap') || relatedTarget?.classList.contains('drag-handle')
      if (isInsideEditor) return
    }
    hideDragHandle()
  }

  return new Plugin({
    key: new PluginKey(options.pluginKey),
    view: (view) => {
      dragHandleElement = document.createElement('div')
      dragHandleElement.draggable = true
      dragHandleElement.dataset.dragHandle = ''
      dragHandleElement.classList.add('drag-handle')
      function onDragHandleDragStart(e) { handleDragStart(e, view) }
      dragHandleElement.addEventListener('dragstart', onDragHandleDragStart)
      function onDragHandleDrag(e) {
        hideDragHandle()
        const scrollY = window.scrollY
        if (e.clientY < options.scrollTreshold) window.scrollTo({ top: scrollY - 30, behavior: 'smooth' })
        else if (window.innerHeight - e.clientY < options.scrollTreshold) window.scrollTo({ top: scrollY + 30, behavior: 'smooth' })
      }
      dragHandleElement.addEventListener('drag', onDragHandleDrag)
      hideDragHandle()
      // 挂到 body（配合 .drag-handle 的 position:fixed）：用视口坐标定位，
      // 不再受编辑器父级 position:relative（DocBlock 的 SaveStatus 包裹层）影响而算偏跑到屏外。
      document.body.appendChild(dragHandleElement)
      view?.dom?.parentElement?.addEventListener('mouseout', hideHandleOnEditorOut)
      return {
        destroy: () => {
          dragHandleElement?.remove?.()
          dragHandleElement?.removeEventListener('drag', onDragHandleDrag)
          dragHandleElement?.removeEventListener('dragstart', onDragHandleDragStart)
          dragHandleElement = null
          view?.dom?.parentElement?.removeEventListener('mouseout', hideHandleOnEditorOut)
        },
      }
    },
    props: {
      handleDOMEvents: {
        // 注意：原扩展这里还有一个 keydown→hideDragHandle，是它对键盘的唯一触点、也是
        // 中文输入法被打断的根源。这里删掉，本扩展不再监听任何键盘/composition 事件。
        mousemove: (view, event) => {
          if (!view.editable) return
          const node = nodeDOMAtCoords({ x: event.clientX + 50 + options.dragHandleWidth, y: event.clientY }, options)
          const notDragging = node?.closest('.not-draggable')
          const excludedTagList = options.excludedTags.concat(['ol', 'ul']).join(', ')
          if (!(node instanceof Element) || node.matches(excludedTagList) || notDragging) {
            hideDragHandle()
            return
          }
          const compStyle = window.getComputedStyle(node)
          const parsedLineHeight = parseInt(compStyle.lineHeight, 10)
          const lineHeight = isNaN(parsedLineHeight) ? parseInt(compStyle.fontSize) * 1.2 : parsedLineHeight
          const paddingTop = parseInt(compStyle.paddingTop, 10)
          const rect = absoluteRect(node)
          rect.top += (lineHeight - 24) / 2
          rect.top += paddingTop
          if (!dragHandleElement) return
          // 水平：固定在正文列左外侧（用 .ProseMirror 内容左缘，不随块缩进而左右移）——
          // 海涛要的「位置固定、不随缩进缩进、和文字保持固定距离、再近一点」。竖直仍跟随 hover 行。
          const pmStyle = window.getComputedStyle(view.dom)
          const colLeft = view.dom.getBoundingClientRect().left + (parseFloat(pmStyle.paddingLeft) || 0)
          dragHandleElement.style.left = `${colLeft - 16}px`
          dragHandleElement.style.top = `${rect.top}px`
          showDragHandle()
          setHoverBlock(node) // hover 手柄/块时整块蓝高亮
        },
        mousewheel: () => { hideDragHandle() },
        dragstart: (view) => { view.dom.classList.add('dragging') },
        drop: (view, event) => {
          view.dom.classList.remove('dragging')
          hideDragHandle()
          // ② 落点后给落地的块闪一下蓝（像通知 flash）。PM 在本 handler 之后才应用移动，setTimeout 等它落定再闪。
          setTimeout(() => {
            try {
              const sel = view.state.selection
              let dom = view.nodeDOM(sel.from)
              if (dom && dom.nodeType !== 1) dom = dom.parentElement
              if (dom && dom.classList) {
                dom.classList.add('drag-dropped')
                setTimeout(() => dom.classList.remove('drag-dropped'), 650)
              }
            } catch { /* ignore */ }
          }, 0)
          let droppedNode = null
          const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!dropPos) return
          if (view.state.selection instanceof NodeSelection) droppedNode = view.state.selection.node
          if (!droppedNode) return
          const resolvedPos = view.state.doc.resolve(dropPos.pos)
          const isDroppedInsideList = resolvedPos.parent.type.name === 'listItem'
          if (view.state.selection instanceof NodeSelection && view.state.selection.node.type.name === 'listItem' && !isDroppedInsideList && listType === 'OL') {
            const newList = view.state.schema.nodes.orderedList?.createAndFill(null, droppedNode)
            const slice = new Slice(Fragment.from(newList), 0, 0)
            view.dragging = { slice, move: event.ctrlKey }
          }
        },
        dragend: (view) => { view.dom.classList.remove('dragging') },
      },
    },
  })
}

export const DragHandle = Extension.create({
  name: 'globalDragHandle',
  addOptions() {
    return { dragHandleWidth: 20, scrollTreshold: 100, excludedTags: [], customNodes: [] }
  },
  addProseMirrorPlugins() {
    return [
      DragHandlePlugin({
        pluginKey: 'globalDragHandle',
        dragHandleWidth: this.options.dragHandleWidth,
        scrollTreshold: this.options.scrollTreshold,
        excludedTags: this.options.excludedTags,
        customNodes: this.options.customNodes,
      }),
    ]
  },
})
