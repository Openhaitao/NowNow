import { useState } from 'react'
import DocEditor from './components/DocEditor'

// P0 验证页：访问 ?doctest 打开，单独试 Tiptap 内核手感，不碰主 App。
// 右下角实时显示 JSON / 纯文本，验证 onChange 出参。
const SEED = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'NowNow 文档内核 P0' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '随便写。打 # 变标题，- 变项目符号，> 变引用，**粗** ==高亮==。' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '选中文字出悬浮工具条' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '撤销/重做、列表、引用都在' }] }] },
    ] },
  ],
}

export default function DocEditorTest() {
  const [out, setOut] = useState({ text: '' })
  return (
    <div className="mx-auto max-w-[760px] px-6 py-10">
      <div className="mb-4 text-[13px] text-stone-400">P0 · Tiptap 文档内核试验台（?doctest）</div>
      <DocEditor content={SEED} onChange={setOut} />
      <pre className="mt-8 max-h-60 overflow-auto rounded-md bg-stone-50 p-3 text-[11px] text-stone-500">
        {out.text}
      </pre>
    </div>
  )
}
