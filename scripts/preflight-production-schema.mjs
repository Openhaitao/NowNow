#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'

const DEFAULT_PRODUCTION_URL = 'https://yklskyyirfboamhtzzhp.supabase.co'
const FETCH_TIMEOUT_MS = 10_000
const REQUIRED_MIGRATIONS = [
  'supabase/migration-022-doc-tags.sql',
  'supabase/migration-023-doc-tags-section.sql',
  'supabase/migration-024-archive-doc-tag.sql',
]

const targetUrl = normalizeUrl(process.env.VITE_SUPABASE_URL || DEFAULT_PRODUCTION_URL)
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!anonKey) {
  fail('Missing VITE_SUPABASE_ANON_KEY. Load .env.production or .env.local before running the preflight.')
}

if (!sourceRequiresDocTags()) {
  console.log('[schema-preflight] Current frontend does not require document tag schema; skipping tag probes.')
  process.exit(0)
}

const probes = [
  restProbe('doc_tags table with section column', '/rest/v1/doc_tags?select=id,section&limit=1'),
  restProbe('docs.tag_id column', '/rest/v1/docs?select=tag_id&limit=1'),
  restProbe('docs_visible.tag_id column', '/rest/v1/docs_visible?select=tag_id&limit=1'),
  restProbe('doc_revisions.tag_id column', '/rest/v1/doc_revisions?select=tag_id&limit=1'),
  // This specific RPC exits at its auth guard before any write when called with the anon token.
  rpcProbe('archive_doc_tag(uuid) RPC', '/rest/v1/rpc/archive_doc_tag', {
    p_tag_id: '00000000-0000-0000-0000-000000000000',
  }),
]

const results = await Promise.all(probes.map((probe) => probe()))
const failures = results.filter((result) => !result.ok)

if (failures.length > 0) {
  console.error(`[schema-preflight] ${hostname(targetUrl)} is missing schema required by the current frontend:`)
  for (const failure of failures) {
    console.error(`- ${failure.name}: ${failure.reason}`)
  }
  console.error('')
  console.error(
    `[schema-preflight] Run and verify these migrations on the target database before deploying this frontend: ${REQUIRED_MIGRATIONS.join(', ')}`,
  )
  process.exit(1)
}

console.log(`[schema-preflight] ${hostname(targetUrl)} has the document tag schema required by this frontend.`)

function normalizeUrl(value) {
  return value.replace(/\/+$/, '')
}

function hostname(value) {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}

function fail(message) {
  console.error(`[schema-preflight] ${message}`)
  process.exit(1)
}

function sourceRequiresDocTags() {
  const files = [
    'src/Board.jsx',
    'src/lib/docsApi.js',
    'src/lib/docMentionsApi.js',
    'src/lib/tagsApi.js',
  ]

  return files.some((file) => {
    if (!existsSync(file)) return false
    const content = readFileSync(file, 'utf8')
    return /\b(doc_tags|tag_id|archive_doc_tag|tagsApi)\b/.test(content)
  })
}

function authHeaders(extra = {}) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    ...extra,
  }
}

function requestOptions(options = {}) {
  const signal = typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
    : undefined

  return {
    ...(signal ? { signal } : {}),
    ...options,
  }
}

function parseProblem(status, body) {
  if (!body) return `HTTP ${status}`

  try {
    const parsed = JSON.parse(body)
    const code = parsed.code ? `${parsed.code}: ` : ''
    const message = parsed.message || parsed.details || body
    return `HTTP ${status} ${code}${message}`
  } catch {
    return `HTTP ${status} ${body.slice(0, 180)}`
  }
}

function isPermissionOnly(status, body) {
  if (status === 401 || status === 403) return true

  try {
    const parsed = JSON.parse(body)
    return parsed.code === '42501'
  } catch {
    return false
  }
}

function restProbe(name, path) {
  return async () => {
    try {
      const res = await fetch(`${targetUrl}${path}`, requestOptions({ headers: authHeaders() }))
      const body = await res.text()

      if (res.ok || isPermissionOnly(res.status, body)) {
        return { name, ok: true }
      }

      return { name, ok: false, reason: parseProblem(res.status, body) }
    } catch (error) {
      return { name, ok: false, reason: error.message || String(error) }
    }
  }
}

function rpcProbe(name, path, payload) {
  return async () => {
    try {
      const res = await fetch(`${targetUrl}${path}`, requestOptions({
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      }))
      const body = await res.text()

      if (res.ok || isPermissionOnly(res.status, body)) {
        return { name, ok: true }
      }

      return { name, ok: false, reason: parseProblem(res.status, body) }
    } catch (error) {
      return { name, ok: false, reason: error.message || String(error) }
    }
  }
}
