// 永不丢字 + 保存状态：在 docsApi 外包一层。
// 核心保证：用户打的字先落 localStorage（秒级、不等网），再尝试落库；断网/失败入队、联网自动重试。
// 刷新/崩溃/断网都不丢——本地草稿在，下次加载优先用它。
// 对外状态机：'saving' | 'saved' | 'offline' | 'error'，给 UI 低干扰指示用（视觉由 @UI 规范）。
import { loadDoc as _loadDoc, saveDoc as _saveDoc } from './docsApi'

const LS_PREFIX = 'nownow_draft:' // 未确认落库的本地草稿
const k = (owner, section, periodKey) => `${LS_PREFIX}${owner}/${section}/${periodKey}`

const pending = new Map() // key -> 最新 payload（断网/失败待重试）

function lsSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }
function lsGet(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null } catch { return null } }
function lsDel(key) { try { localStorage.removeItem(key) } catch {} }

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

// 读：本地有未同步草稿就优先用（防"断网/刷新丢字"），否则读服务器。
export async function loadDocResilient(owner, section, periodKey) {
  const local = lsGet(k(owner, section, periodKey))
  if (local && local.json !== undefined) return local.json ?? null
  return _loadDoc(owner, section, periodKey)
}

// 存：先落本地（永不丢），再尝试落库；失败/断网入队等重试。onState 给 UI 显示。
export async function saveDocResilient({ owner, section, periodKey, json, text }, onState) {
  const key = k(owner, section, periodKey)
  const payload = { owner, section, periodKey, json, text }
  lsSet(key, payload) // ← 永不丢字：先写本地
  if (isOffline()) { pending.set(key, payload); onState?.('offline'); return }
  onState?.('saving')
  try {
    await _saveDoc(payload)
    lsDel(key); pending.delete(key)
    onState?.('saved')
  } catch {
    pending.set(key, payload)
    onState?.(isOffline() ? 'offline' : 'error')
  }
}

// 重试队列里所有待存的（联网恢复 / 启动时调）。
export async function flushPending() {
  if (isOffline() || pending.size === 0) return
  for (const [key, payload] of [...pending]) {
    try { await _saveDoc(payload); lsDel(key); pending.delete(key) } catch { /* 留到下次 */ }
  }
}

// 启动时把上次会话遗留的本地草稿收进重试队列（关标签页/断网遗留也不丢）。
if (typeof window !== 'undefined') {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(LS_PREFIX)) {
        const p = lsGet(key)
        if (p) pending.set(key, p)
      }
    }
  } catch {}
  flushPending()
  window.addEventListener('online', flushPending)
}
