import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// 文档里 @ 人名按「我派的这条任务完成没」上色：已完成→加 .doc-mention-done(黄)，未完成→默认蓝。
// 完成态(doc_mentions.completed_at)是外部数据、不该进 doc_json，所以用 decoration 动态上色、不落库。
// getDone() 返回 {mid: 已完成bool}；完成态变了（对方点完成后重拉），DocEditor dispatch 一个空 tr 触发重算。
export function MentionDone(getDone) {
  return Extension.create({
    name: 'mentionDone',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations(state) {
              const done = getDone() || {}
              const decos = []
              state.doc.descendants((node, pos) => {
                if (node.type.name === 'mention' && node.attrs?.mid && done[node.attrs.mid]) {
                  decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'doc-mention-done' }))
                }
              })
              return DecorationSet.create(state.doc, decos)
            },
          },
        }),
      ]
    },
  })
}
