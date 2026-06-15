// 永不丢字 + 保存状态：在 docsApi 外包一层。
// 核心保证：用户打的字先落 localStorage（秒级、不等网），再尝试落库；断网/失败入队、联网自动重试。
// 刷新/崩溃/断网都不丢——本地草稿在，下次加载优先用它。
// 对外状态机：'saving' | 'saved' | 'offline' | 'error'，给 UI 低干扰指示用（视觉由 @UI 规范）。
import { loadDoc as _loadDoc, saveDoc as _saveDoc } from './docsApi'

const LS_PREFIX = 'nownow_draft:' // 未确认落库的本地草稿
const LS_BACKUP_PREFIX = 'nownow_backup:' // 空覆盖前留的旧内容（客户端兜底，配合服务端 doc_revisions）
const k = (owner, section, periodKey) => `${LS_PREFIX}${owner}/${section}/${periodKey}`
const bk = (owner, section, periodKey) => `${LS_BACKUP_PREFIX}${owner}/${section}/${periodKey}`

const pending = new Map() // key -> 最新 payload（断网/失败待重试）

function lsSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }
function lsGet(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null } catch { return null } }
function lsDel(key) { try { localStorage.removeItem(key) } catch {} }

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

// 一份 PM JSON / 文本是否"实质为空"（空 doc、只剩空段落、无可见内容）。
// 防数据丢失的关键判定：空草稿不许遮服务器、空内容覆盖非空前先备份。
function isEffectivelyEmpty(json, text) {
  if (typeof text === 'string' && text.trim().length > 0) return false
  if (!json || !Array.isArray(json.content)) return true
  const hasContent = (node) => {
    if (!node) return false
    if (node.type === 'text' && (node.text || '').trim()) return true
    if (node.type === 'mention') return true
    if (['image', 'table', 'horizontalRule'].includes(node.type)) return true
    return Array.isArray(node.content) && node.content.some(hasContent)
  }
  return !json.content.some(hasContent)
}

// 读：本地有未同步草稿就优先用（防"断网/刷新丢字"），否则读服务器。
// 守卫(P1-6)：本地草稿"实质为空"时绝不盲信——去服务器看一眼，服务器非空就以服务器为准、
// 并清掉这份坏空草稿。否则一份误存的空草稿会一直遮住库里的真内容（这次事故的显空根因之一）。
export async function loadDocResilient(owner, section, periodKey) {
  const local = lsGet(k(owner, section, periodKey))
  if (local && local.json !== undefined) {
    if (!isEffectivelyEmpty(local.json, local.text)) return local.json ?? null
    try {
      const server = await _loadDoc(owner, section, periodKey)
      if (!isEffectivelyEmpty(server, null)) { lsDel(k(owner, section, periodKey)); return server }
    } catch { /* 服务器读不到：退回本地，保持"永不丢字"语义 */ }
    return local.json ?? null
  }
  return _loadDoc(owner, section, periodKey)
}

// 存：先落本地（永不丢），再尝试落库；失败/断网入队等重试。onState 给 UI 显示。
// 守卫(P0-2)：把"空"存进来、而上一份非空时，先把旧的备份到 backup key——客户端兜底；
// 服务端还有 doc_revisions 触发器在覆盖前快照旧版，双保险，空存也丢不掉。
export async function saveDocResilient({ owner, section, periodKey, json, text }, onState) {
  const key = k(owner, section, periodKey)
  if (isEffectivelyEmpty(json, text)) {
    const prev = lsGet(key)
    if (prev && !isEffectivelyEmpty(prev.json, prev.text)) {
      lsSet(bk(owner, section, periodKey), { ...prev, backedUpAt: new Date().toISOString() })
    }
  }
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
