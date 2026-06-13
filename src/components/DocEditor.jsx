import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { Bold, Highlighter, Italic, List, ListOrdered, Quote, Strikethrough, Underline as UnderlineIcon } from 'lucide-react'
import './doc-editor.css'

// P0：Tiptap 单人版文档内核。替代「每行一个 entry + textarea」的旧模型——
// 整页就是一份 ProseMirror 文档。markdown 输入规则、行内格式、悬浮工具条都走原生扩展。
// content 进：ProseMirror JSON（或空）；out：onChange({ json, text }) —— json 落库、text 喂搜索/RLS。
// @提及 / 图片插入 下一步加；Yjs/协作（老铁的 DO）等同篇协作需求出现再叠。
export default function DocEditor({ content, onChange, placeholder = '写点什么…', editable = true }) {
  const editor = useEditor({
    editable,
    extensions: [
      // StarterKit v3 已含 bold/italic/strike/underline/link/heading/lists/blockquote/code/undo 等
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Highlight, // ==高亮==
      Image,
      Placeholder.configure({ placeholder }),
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
    </div>
  )
}
