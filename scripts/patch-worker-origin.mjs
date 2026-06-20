import { readFileSync, writeFileSync } from 'node:fs'

const origin = (process.argv[2] || '').replace(/\/+$/, '')
if (!origin) {
  console.error('Usage: node scripts/patch-worker-origin.mjs https://PROJECT.supabase.co')
  process.exit(1)
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(origin)) {
  console.error(`Refusing suspicious Supabase origin: ${origin}`)
  process.exit(1)
}

const file = 'dist/_worker.js'
const placeholder = '__NOWNOW_SUPABASE_ORIGIN__'
const source = readFileSync(file, 'utf8')

if (!source.includes(placeholder)) {
  console.error(`Missing ${placeholder} in ${file}`)
  process.exit(1)
}

writeFileSync(file, source.replaceAll(placeholder, origin))
console.log(`Patched ${file} Supabase origin: ${origin}`)
