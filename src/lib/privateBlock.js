import { Extension } from '@tiptap/core'

// 逐行私密：给块级节点加一个布尔 `private` 属性，渲染成 data-private="true"（CSS 给自己侧锁标识）。
// 真隐私由数据侧兜底（老铁）：存的时候按 attrs.private 递归剥离生成 doc_json_public，
// 别人读到的版本里这些块根本不存在（含其中的 @通知、搜索文字）。前端只负责打标记 + 自己侧提示。
const PRIVATE_TYPES = ['paragraph', 'heading', 'taskItem', 'listItem', 'blockquote', 'codeBlock']

export const PrivateBlock = Extension.create({
  name: 'privateBlock',
  addGlobalAttributes() {
    return [
      {
        types: PRIVATE_TYPES,
        attributes: {
          private: {
            default: false,
            keepOnSplit: false, // 回车另起一行不继承私密，避免误把新行也设私密
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

// 切换「当前这条」的私密标记。
export function toggleBlockPrivate(editor) {
  const { state } = editor
  const { $from } = state.selection
  const depth = currentBlockDepth($from)
  const node = $from.node(depth)
  const pos = $from.before(depth)
  editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, private: !node.attrs.private }))
  editor.commands.focus()
}

// 当前这条是否已私密（给工具条按钮的高亮态）。
export function isBlockPrivate(editor) {
  const { $from } = editor.state.selection
  const depth = currentBlockDepth($from)
  return !!$from.node(depth)?.attrs?.private
}
