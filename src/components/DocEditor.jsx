import { useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import Mention from '@tiptap/extension-mention'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import { ResizableImage } from './ResizableImage'
import { DragHandle } from './DragHandle'
import { SlashCommand } from './SlashCommand'
import { Callout } from './Callout'
import { Bold, CheckSquare, Code, Heading1, Heading2, Heading3, Highlighter, Image as ImageIcon, Info, Italic, List, ListOrdered, Minus, Quote, Strikethrough, Table as TableIcon, Underline as UnderlineIcon } from 'lucide-react'
import { uploadImage } from '../lib/storage'
import './doc-editor.css'

const lowlight = createLowlight(common)
const TEXT_COLORS = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#9333ea'] // 字体色：红橙黄绿蓝紫
const HL_COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8'] // 背景高亮：黄绿蓝粉

// 插图：先用本地预览秒显（不等上传），后台传 Storage，传完把 src 换成公网地址。
function insertImageFromFile(view, file, uploaderId) {
  const localUrl = URL.createObjectURL(file)
  const node = view.state.schema.nodes.image.create({ src: localUrl })
  view.dispatch(view.state.tr.replaceSelectionWith(node))
  uploadImage(file, uploaderId)
    .then((url) => {
      let pos = null
      view.state.doc.descendants((n, p) => {
        if (n.type.name === 'image' && n.attrs.src === localUrl) { pos = p; return false }
      })
      if (pos != null) {
        const attrs = { ...view.state.doc.nodeAt(pos).attrs, src: url }
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, attrs))
      }
      URL.revokeObjectURL(localUrl)
    })
    .catch((e) => console.error('图片上传失败', e))
}

// P0：Tiptap 单人版文档内核。替代「每行一个 entry + textarea」的旧模型——
// 整页就是一份 ProseMirror 文档。markdown 输入规则、行内格式、悬浮工具条都走原生扩展。
// content 进：ProseMirror JSON（或空）；out：onChange({ json, text }) —— json 落库、text 喂搜索/RLS。
// @提及 / 图片插入 下一步加；Yjs/协作（老铁的 DO）等同篇协作需求出现再叠。
export default function DocEditor({ content, onChange, placeholder = '写点什么…', editable = true, profiles = [], uploaderId }) {
  // @ 弹选：suggestion 的 items/onKeyDown 需读最新 profiles/选中态 → 用 ref 兜
  const profilesRef = useRef(profiles)
  profilesRef.current = profiles
  const [sug, setSug] = useState(null) // { items, rect, command, index } | null
  const sugRef = useRef(null)
  sugRef.current = sug
  // Slash `/` 菜单
  const [slash, setSlash] = useState(null)
  const slashRef = useRef(null)
  slashRef.current = slash
  const fileInputRef = useRef(null)

  const slashItems = [
    { title: '待办清单', icon: CheckSquare, kw: 'todo task daiban 待办 清单', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run() },
    { title: '标题 1', icon: Heading1, kw: 'h1 标题 title', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run() },
    { title: '标题 2', icon: Heading2, kw: 'h2 标题', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run() },
    { title: '标题 3', icon: Heading3, kw: 'h3 标题', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run() },
    { title: '项目符号', icon: List, kw: 'bullet list 列表 符号', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
    { title: '编号列表', icon: ListOrdered, kw: 'number ordered 编号', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
    { title: '引用', icon: Quote, kw: 'quote 引用', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
    { title: '代码块', icon: Code, kw: 'code 代码', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
    { title: '分割线', icon: Minus, kw: 'divider hr 分割 线', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
    { title: '表格', icon: TableIcon, kw: 'table 表格', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { title: '提示块', icon: Info, kw: 'callout 提示 info 块', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCallout().run() },
    { title: '图片', icon: ImageIcon, kw: 'image 图片 picture', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).run(); fileInputRef.current?.click() } },
  ]

  const editor = useEditor({
    editable,
    extensions: [
      // StarterKit v3 已含 bold/italic/strike/underline/link/heading/lists/blockquote/undo 等；codeBlock 换成带高亮的
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }), // 代码块语法高亮
      Highlight.configure({ multicolor: true }), // ==高亮==，支持多色背景
      TextStyle,
      Color, // 字体颜色
      ResizableImage,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Callout,
      // 块拖拽：用本地 fork 的 DragHandle（去掉了原扩展打断中文输入法的 keydown 监听，IME 安全）
      ...(editable ? [DragHandle.configure({ dragHandleWidth: 20, scrollTreshold: 100 })] : []),
      SlashCommand.configure({
        suggestion: {
          items: ({ query }) => {
            const q = query.toLowerCase()
            return slashItems.filter((it) => it.title.toLowerCase().includes(q) || it.kw.includes(q))
          },
          render: () => ({
            onStart: (props) => setSlash({ items: props.items, rect: props.clientRect?.(), command: props.command, index: 0 }),
            onUpdate: (props) => setSlash((s) => (s ? { ...s, items: props.items, rect: props.clientRect?.(), command: props.command, index: 0 } : null)),
            onKeyDown: (props) => {
              const s = slashRef.current
              if (!s || !s.items.length) return false
              if (props.event.key === 'ArrowDown') { setSlash((x) => ({ ...x, index: (x.index + 1) % x.items.length })); return true }
              if (props.event.key === 'ArrowUp') { setSlash((x) => ({ ...x, index: (x.index - 1 + x.items.length) % x.items.length })); return true }
              if (props.event.key === 'Enter') { const it = s.items[s.index]; if (it) s.command(it); return true }
              if (props.event.key === 'Escape') { setSlash(null); return true }
              return false
            },
            onExit: () => setSlash(null),
          }),
        },
      }),
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
    editorProps: {
      attributes: { class: 'doc-prose outline-none' },
      // 粘贴/拖拽图片 → 传 Storage → 插入（只在可写 + 有 uploaderId 时）
      handlePaste: (view, event) => {
        if (!editable || !uploaderId) return false
        const file = [...(event.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'))
        if (!file) return false
        event.preventDefault()
        insertImageFromFile(view, file, uploaderId)
        return true
      },
      handleDrop: (view, event) => {
        if (!editable || !uploaderId) return false
        const file = [...(event.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'))
        if (!file) return false
        event.preventDefault()
        insertImageFromFile(view, file, uploaderId)
        return true
      },
    },
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
        shouldShow={({ editor, state }) => {
          if (!editor.isEditable) return false
          // 选中图片(NodeSelection)时不弹文字气泡，交给图片自己的工具条
          if (editor.isActive('image')) return false
          return !state.selection.empty
        }}
        className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-[var(--surface-elevated)] p-1 text-stone-600 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
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
        <span className="mx-0.5 h-4 w-px bg-stone-200" />
        {/* 字体颜色 */}
        {TEXT_COLORS.map((c) => (
          <button
            key={'t' + c}
            type="button"
            title="字体颜色"
            onClick={() => editor.chain().focus().setColor(c).run()}
            className="flex h-7 w-5 items-center justify-center rounded-md hover:bg-stone-100"
          >
            <span className="text-[13px] font-bold leading-none" style={{ color: c }}>A</span>
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px bg-stone-200" />
        {/* 背景高亮色 */}
        {HL_COLORS.map((c) => (
          <button
            key={'h' + c}
            type="button"
            title="背景高亮"
            onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
            className="flex h-7 w-5 items-center justify-center rounded-md hover:bg-stone-100"
          >
            <span className="h-3.5 w-3.5 rounded-sm" style={{ background: c }} />
          </button>
        ))}
        <button
          type="button"
          title="清除颜色"
          onClick={() => editor.chain().focus().unsetColor().unsetHighlight().run()}
          className="flex h-7 w-6 items-center justify-center rounded-md text-[11px] text-stone-400 hover:bg-stone-100"
        >
          清除
        </button>
      </BubbleMenu>
      <EditorContent editor={editor} />
      {sug && sug.items.length > 0 && sug.rect && (
        <div
          className="fixed z-50 w-48 rounded-lg border border-stone-200 bg-[var(--surface-elevated)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
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
      {slash && slash.items.length > 0 && slash.rect && (
        <div
          className="fixed z-50 max-h-72 w-52 overflow-auto rounded-lg border border-stone-200 bg-[var(--surface-elevated)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
          style={{ left: slash.rect.left, top: slash.rect.bottom + 4 }}
        >
          {slash.items.map((it, i) => (
            <button
              key={it.title}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); slash.command(it) }}
              className={
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm ' +
                (i === slash.index ? 'bg-blue-50 text-blue-700' : 'text-stone-700')
              }
            >
              <it.icon size={15} strokeWidth={2} />
              <span>{it.title}</span>
            </button>
          ))}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && uploaderId) insertImageFromFile(editor.view, file, uploaderId)
          e.target.value = ''
        }}
      />
    </div>
  )
}
