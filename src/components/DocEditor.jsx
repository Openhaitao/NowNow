import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
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
import { Bold, CheckSquare, ChevronDown, Code, Heading1, Heading2, Heading3, Highlighter, Image as ImageIcon, Info, Italic, List, ListOrdered, Minus, Quote, Strikethrough, Table as TableIcon, Underline as UnderlineIcon } from 'lucide-react'
import { uploadImage } from '../lib/storage'
import './doc-editor.css'

const lowlight = createLowlight(common)
const TEXT_COLORS = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#9333ea'] // 字体色：红橙黄绿蓝紫
const HL_COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8'] // 背景高亮：黄绿蓝粉

// 给 mention 节点加一个稳定唯一的 mid（插入时生成），让「每个 @ = 一条独立通知/任务」：
// syncDocMentions 按 mid 存 doc_mentions，同一人被 @ 多次也各算各的、各自有 completed_at/snippet。
const MentionWithId = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mid: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-mid') || newMid(), // HTML 粘贴的老 mention 没有就现生成
        renderHTML: (attrs) => (attrs.mid ? { 'data-mid': attrs.mid } : {}),
      },
    }
  },
})
const newMid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'm-' + Math.random().toString(36).slice(2) + Date.now())

// 插图：先用本地预览秒显（不等上传），后台传 Storage，传完把 src 换成公网地址。
function insertImageFromFile(view, file, uploaderId) {
  const localUrl = URL.createObjectURL(file)
  const { schema } = view.state
  const node = schema.nodes.image.create({ src: localUrl })
  // 插入图片后把光标落到图片后面（图片在末尾就补个空段落），这样能直接接着打字，
  // 不会卡在图片的 NodeSelection 上（之前要点别处/刷新才能编辑就是这个）。
  let tr = view.state.tr.replaceSelectionWith(node)
  const after = tr.selection.to
  if (!tr.doc.resolve(after).nodeAfter) tr = tr.insert(after, schema.nodes.paragraph.create())
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(after), 1)).scrollIntoView()
  view.dispatch(tr)
  view.focus()
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
  const [colorPanel, setColorPanel] = useState(false) // 选区工具条里「A」颜色面板展开态（飞书式整合）

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
      // dropcursor：拖拽时目标落点画一条主题蓝指示线（Notion/飞书那条线），加粗到 3px 更显眼
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, dropcursor: { color: '#2563eb', width: 3, class: 'doc-dropcursor' } }),
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
      // 块拖拽：本地 fork 的 DragHandle（去掉原扩展打断中文输入法的 keydown，IME 安全）。
      // 不按建时 editable 门控——它内部 mousemove 已 self-gate `view.editable`，配 setEditable 跟随。
      // （否则编辑器若以只读建、之后 setEditable(true)，拖拽 icon 就永远不出现。）
      DragHandle.configure({ dragHandleWidth: 20, scrollTreshold: 100 }),
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
      MentionWithId.configure({
        HTMLAttributes: { class: 'doc-mention' },
        suggestion: {
          char: '@',
          // 默认要求 @ 前面是空格/行首 → 「测试@名字」这种紧贴前字的就不触发。null = 任意位置都能 @
          allowedPrefixes: null,
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
              if (props.event.key === 'Enter') { const it = s.items[s.index]; if (it) s.command({ id: it.id, label: it.display_name, mid: newMid() }); return true }
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
      // Cmd/Ctrl+Shift+V = 去格式粘贴（飞书式）：读剪贴板纯文本插入，丢掉所有格式
      handleKeyDown: (view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyV') {
          event.preventDefault()
          navigator.clipboard?.readText?.().then((text) => { if (text) view.pasteText(text) }).catch(() => {})
          return true
        }
        return false
      },
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
    // 老文档（本次部署前的 @）从 JSON 加载时 mention 没有 mid（parseHTML 不走 JSON）。
    // 加载后扫一遍，给缺 mid 的 mention 补上 → 自动保存持久化 → sync 全程不见 null、prune 不误删。
    onCreate: ({ editor }) => {
      if (!editor.isEditable) return
      let tr = editor.state.tr
      let changed = false
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'mention' && !node.attrs.mid) {
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, mid: newMid() })
          changed = true
        }
      })
      if (changed) editor.view.dispatch(tr.setMeta('addToHistory', false))
    },
    onUpdate: ({ editor }) => onChange?.({ json: editor.getJSON(), text: editor.getText() }),
  })

  // editable 是建编辑器时定的；prop 变了（如 isMyPage 在 profiles/页面状态稳定后才变 true）
  // 要同步给已存在的编辑器，否则会卡在只读、得刷新页面才能编辑。
  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable)
  }, [editor, editable])

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
        {/* 颜色：整合成一个「A」按钮 + 下拉面板（飞书式，不再平铺所有色块）*/}
        <span className="relative">
          <button
            type="button"
            title="字体 / 背景颜色"
            onMouseDown={(e) => { e.preventDefault(); setColorPanel((v) => !v) }}
            className={'flex h-7 items-center gap-0.5 rounded-md px-1 hover:bg-stone-100 hover:text-stone-900 ' + (colorPanel ? 'bg-stone-200 text-stone-900' : '')}
          >
            <span className="text-[13px] font-bold leading-none">A</span>
            <ChevronDown size={11} strokeWidth={2.5} />
          </button>
          {colorPanel && (
            <div
              className="absolute left-0 top-full z-50 mt-1.5 w-52 rounded-lg border border-stone-200 bg-[var(--surface-elevated)] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.1)]"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="mb-1.5 text-[11px] text-stone-400">字体颜色</div>
              <div className="flex flex-wrap gap-1">
                <button type="button" title="默认" onClick={() => editor.chain().focus().unsetColor().run()} className="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 hover:bg-stone-100">
                  <span className="text-[13px] font-bold leading-none text-[var(--ink)]">A</span>
                </button>
                {TEXT_COLORS.map((c) => (
                  <button key={'t' + c} type="button" onClick={() => editor.chain().focus().setColor(c).run()} className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-stone-100">
                    <span className="text-[13px] font-bold leading-none" style={{ color: c }}>A</span>
                  </button>
                ))}
              </div>
              <div className="mb-1.5 mt-2.5 text-[11px] text-stone-400">背景颜色</div>
              <div className="flex flex-wrap gap-1">
                <button type="button" title="无" onClick={() => editor.chain().focus().unsetHighlight().run()} className="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 hover:bg-stone-100">
                  <span className="text-[12px] leading-none text-stone-300">/</span>
                </button>
                {HL_COLORS.map((c) => (
                  <button key={'h' + c} type="button" onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()} className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-stone-100">
                    <span className="h-4 w-4 rounded" style={{ background: c }} />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => editor.chain().focus().unsetColor().unsetHighlight().run()} className="mt-2.5 w-full rounded-md border border-stone-200 py-1 text-[12px] text-stone-500 hover:bg-stone-100">
                恢复默认
              </button>
            </div>
          )}
        </span>
      </BubbleMenu>
      <EditorContent editor={editor} />
      {sug && sug.items.length > 0 && sug.rect && (
        <div
          className="fixed z-50 w-36 rounded-lg border border-stone-200 bg-[var(--surface-elevated)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
          style={{ left: sug.rect.left, top: sug.rect.bottom + 4 }}
        >
          {sug.items.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); sug.command({ id: p.id, label: p.display_name, mid: newMid() }) }}
              className={
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ' +
                (i === sug.index ? 'bg-blue-50 text-blue-700' : 'text-stone-700')
              }
            >
              <span className="font-medium">{p.display_name}</span>
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
