import { useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Mention from '@tiptap/extension-mention'
import { Bold, Highlighter, Italic, List, ListOrdered, Quote, Strikethrough, Underline as UnderlineIcon } from 'lucide-react'
import './doc-editor.css'

// P0：Tiptap 单人版文档内核。替代「每行一个 entry + textarea」的旧模型——
// 整页就是一份 ProseMirror 文档。markdown 输入规则、行内格式、悬浮工具条都走原生扩展。
// content 进：ProseMirror JSON（或空）；out：onChange({ json, text }) —— json 落库、text 喂搜索/RLS。
// @提及 / 图片插入 下一步加；Yjs/协作（老铁的 DO）等同篇协作需求出现再叠。
export default function DocEditor({ content, onChange, placeholder = '写点什么…', editable = true, profiles = [] }) {
  // @ 弹选：suggestion 的 items/onKeyDown 需读最新 profiles/选中态 → 用 ref 兜
  const profilesRef = useRef(profiles)
  profilesRef.current = profiles
  const [sug, setSug] = useState(null) // { items, rect, command, index } | null
  const sugRef = useRef(null)
  sugRef.current = sug

  const editor = useEditor({
    editable,
    extensions: [
      // StarterKit v3 已含 bold/italic/strike/underline/link/heading/lists/blockquote/code/undo 等
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Highlight, // ==高亮==
      Image,
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: 'doc-mention' },
        suggestion: {
          char: '@',
          items: ({ query }) => {
            const q = query.toLowerCase()
            return profilesRef.current
              .filter((p) => p.handle?.toLowerCase().includes(q) || p.display_name?.toLowerCase().includes(q))
              .slice(0, 6)
          },
          render: () => ({
            onStart: (props) => setSug({ items: props.items, rect: props.clientRect?.(), command: props.command, index: 0 }),
            onUpdate: (props) =>
              setSug((s) => (s ? { ...s, items: props.items, rect: props.clientRect?.(), command: props.command, index: 0 } : null)),
            onKeyDown: (props) => {
              const s = sugRef.current
              if (!s || !s.items.length) return false
              if (props.event.key === 'ArrowDown') { setSug((x) => ({ ...x, index: (x.index + 1) % x.items.length })); return true }
              if (props.event.key === 'ArrowUp') { setSug((x) => ({ ...x, index: (x.index - 1 + x.items.length) % x.items.length })); return true }
              if (props.event.key === 'Enter') { const it = s.items[s.index]; if (it) s.command({ id: it.id, label: it.handle }); return true }
              if (props.event.key === 'Escape') { setSug(null); return true }
              return false
            },
            onExit: () => setSug(null),
          }),
        },
      }),
    ],
    content: content ?? '',
    editorProps: { attributes: { class: 'doc-prose outline-none' } },
    onUpdate: ({ editor }) => onChange?.({ json: editor.getJSON(), text: editor.getText() }),
  })

  if (!editor) return null

  const tb = [
    { icon: Bold, run: () => editor.chain().focus().toggleBold().run(), on: editor.isActive('bold'), title: '加粗' },
    { icon: Italic, run: () => editor.chain().focus().toggleItalic().run(), on: editor.isActive('italic'), title: '斜体' },
    { icon: UnderlineIcon, run: () => editor.chain().focus().toggleUnderline().run(), on: editor.isActive('underline'), title: '下划线' },
    { icon: Strikethrough, run: () => editor.chain().focus().toggleStrike().run(), on: editor.isActive('strike'), title: '删除线' },
    { icon: Highlighter, run: () => editor.chain().focus().toggleHighlight().run(), on: editor.isActive('highlight'), title: '高亮' },
    { sep: true },
    { icon: List, run: () => editor.chain().focus().toggleBulletList().run(), on: editor.isActive('bulletList'), title: '项目符号' },
    { icon: ListOrdered, run: () => editor.chain().focus().toggleOrderedList().run(), on: editor.isActive('orderedList'), title: '编号' },
    { icon: Quote, run: () => editor.chain().focus().toggleBlockquote().run(), on: editor.isActive('blockquote'), title: '引用' },
  ]

  return (
    <div className="doc-editor">
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-1 text-stone-600 shadow-xl"
      >
        {tb.map((b, i) =>
          b.sep ? (
            <span key={i} className="mx-0.5 h-4 w-px bg-stone-200" />
          ) : (
            <button
              key={i}
              type="button"
              title={b.title}
              onClick={b.run}
              className={'flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100 hover:text-stone-900 ' + (b.on ? 'bg-stone-200 text-stone-900' : '')}
            >
              <b.icon size={15} strokeWidth={2.2} />
            </button>
          ),
        )}
      </BubbleMenu>
      <EditorContent editor={editor} />
      {sug && sug.items.length > 0 && sug.rect && (
        <div
          className="fixed z-50 w-48 rounded-lg border border-stone-200 bg-white p-1 shadow-xl"
          style={{ left: sug.rect.left, top: sug.rect.bottom + 4 }}
        >
          {sug.items.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); sug.command({ id: p.id, label: p.handle }) }}
              className={
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ' +
                (i === sug.index ? 'bg-blue-50 text-blue-700' : 'text-stone-700')
              }
            >
              <span>{p.display_name}</span>
              <span className="text-stone-400">@{p.handle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
