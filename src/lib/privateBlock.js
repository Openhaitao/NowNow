import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// 逐行私密：给块级节点加一个布尔 `private` 属性，渲染成 data-private="true"（CSS 给自己侧底色）。
// 真隐私由数据侧兜底（老铁）：存的时候按 attrs.private 递归剥离生成 doc_json_public，
// 别人读到的版本里这些块根本不存在（含其中的 @通知、搜索文字）。前端只负责打标记 + 自己侧提示。
const PRIVATE_TYPES = ['paragraph', 'heading', 'taskItem', 'listItem', 'blockquote', 'codeBlock']

// PrivateBlock：只加属性（DocEditor + markdown 转换器共用，转换器不需要下面的 UI 插件）。
export const PrivateBlock = Extension.create({
  name: 'privateBlock',
  addGlobalAttributes() {
    return [
      {
        types: PRIVATE_TYPES,
        attributes: {
          private: {
            default: false,
            keepOnSplit: false, // 回车另起一行不继承私密
            renderHTML: (attrs) => (attrs.private ? { 'data-private': 'true' } : {}),
            parseHTML: (el) => el.getAttribute('data-private') === 'true',
          },
        },
      },
    ]
  },
})

// 定位「当前这条」：最近的 taskItem/listItem（待办/列表里「这条」=那一项）；不在列表里就用顶层块。
function currentBlockDepth($from) {
  for (let d = $from.depth; d >= 1; d--) {
    const name = $from.node(d).type.name
    if (name === 'taskItem' || name === 'listItem') return d
  }
  return 1
}

// 切换「当前这条」的私密标记（悬浮条 🔒/🔓 按钮用）。
export function toggleBlockPrivate(editor) {
  const { state } = editor
  const { $from } = state.selection
  const depth = currentBlockDepth($from)
  const node = $from.node(depth)
  const pos = $from.before(depth)
  editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, private: !node.attrs.private }))
  editor.commands.focus()
}

// 当前这条是否已私密（按钮高亮 + 图标在 🔒/🔓 间切换）。
export function isBlockPrivate(editor) {
  const { $from } = editor.state.selection
  const depth = currentBlockDepth($from)
  return !!$from.node(depth)?.attrs?.private
}

// lucide「Lock」闭锁描边图标——私密块右侧常驻一个闭锁角标（状态=已私密），点它取消私密。
const LOCK_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'

// PrivateBlockLock：私密块上挂一个可点的解锁角标（只在 DocEditor 用，转换器不加）。
// 点它 = 取消这条的私密（和悬浮条 🔓 等效），用 ProseMirror widget 实现（CSS 定位到块右上角）。
export const PrivateBlockLock = Extension.create({
  name: 'privateBlockLock',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decos = []
            state.doc.descendants((node, pos) => {
              if (!node.attrs?.private) return
              decos.push(
                Decoration.widget(
                  pos + 1,
                  (view, getPos) => {
                    const btn = document.createElement('button')
                    btn.type = 'button'
                    btn.className = 'doc-private-lock'
                    btn.title = '已私密 · 点击取消'
                    btn.setAttribute('contenteditable', 'false')
                    btn.innerHTML = LOCK_SVG
                    btn.addEventListener('mousedown', (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const wpos = typeof getPos === 'function' ? getPos() : null
                      if (wpos == null) return
                      const $p = view.state.doc.resolve(wpos)
                      for (let d = $p.depth; d >= 1; d--) {
                        const n = $p.node(d)
                        if (n.attrs?.private) {
                          view.dispatch(view.state.tr.setNodeMarkup($p.before(d), undefined, { ...n.attrs, private: false }))
                          return
                        }
                      }
                    })
                    return btn
                  },
                  { side: 1 },
                ),
              )
            })
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
