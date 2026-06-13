import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { currentTheme, toggleTheme } from '../lib/theme'

// 亮/暗切换按钮。色值走 token，由 styles.css 的 :root / [data-theme="dark"] 决定（Vincent 按 spool 填）。
// 放哪由 Vincent 定（侧栏底部/设置里），这里只给组件。
export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(() => currentTheme())
  return (
    <button
      type="button"
      onClick={() => setTheme(toggleTheme())}
      title={theme === 'dark' ? '切到亮色' : '切到暗色'}
      aria-label="切换亮/暗色"
      className={'rounded-md p-1.5 transition-colors hover:bg-[var(--surface-hover)] ' + className}
      style={{ color: 'var(--ink-muted)' }}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
