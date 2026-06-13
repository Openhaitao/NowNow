// 暗色模式：light/dark 切换 + localStorage 记忆 + 默认跟随系统。
// 机制：给 <html> 设 data-theme="dark"|"light"。
// 色值由 styles.css 提供两套 token：:root（light）和 [data-theme="dark"]（Vincent 按 spool DESIGN.md 填）。
// 这里只管"切哪套"，不碰具体颜色——结构与值解耦。
const KEY = 'nownow_theme'

function stored() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

// 当前应生效的主题：存过的优先，否则跟随系统。
export function resolveTheme() {
  return stored() || (systemPrefersDark() ? 'dark' : 'light')
}

export function applyTheme(theme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
}

export function currentTheme() {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme || 'light'
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme) } catch {}
  applyTheme(theme)
}

// 设置中的三态：'light' | 'dark' | 'system'。system = 清掉记忆、跟随系统。
export function setPreference(pref) {
  if (pref === 'system') {
    try { localStorage.removeItem(KEY) } catch {}
    applyTheme(systemPrefersDark() ? 'dark' : 'light')
  } else {
    setTheme(pref)
  }
}

// 当前偏好（给设置面板的三态选择回显）：存过 light/dark 就是它，没存过 = 'system'。
export function getPreference() {
  return stored() || 'system'
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

// 启动即应用（main.jsx 顶部调用），并跟随系统切换（仅当用户没手动设过）。
export function initTheme() {
  applyTheme(resolveTheme())
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
      if (!stored()) applyTheme(e.matches ? 'dark' : 'light')
    })
  }
}
